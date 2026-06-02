/**
 * LLM layer — Gemini Flash for all 3 pipeline roles (LLM-Only, BasicRAG, GraphRAG)
 * Judge remains on Groq (accuracy.ts has its own client)
 *
 * Switched from Groq llama-3.1-8b to Gemini 2.0 Flash:
 *   - 1M token context window (no more 6K TPM cap on BasicRAG)
 *   - Paid key from TigerGraph hackathon coordinator ($50 credits)
 *   - Same model across all 3 pipelines = fair comparison
 */
import Groq from 'groq-sdk';

// ── Gemini config ─────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash'; // gemini-2.0-flash deprecated (404) Jun 2026
const GEMINI_API_KEY = () => process.env.GOOGLE_API_KEY ?? '';
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

// Gemini pricing (gemini-2.5-flash): $0.30/1M in, $2.50/1M out
const GEMINI_PRICE = { in: 0.30 / 1e6, out: 2.50 / 1e6 };

export interface LLMResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export function costUsd(_model: string, p: number, c: number): number {
  return p * GEMINI_PRICE.in + c * GEMINI_PRICE.out;
}

// ── Rate limiter — 500ms min gap between Gemini calls ─────────────────────────
let _lastCall = 0;
let _queue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = _queue.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, _lastCall + 500 - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    _lastCall = Date.now();
    return fn();
  });
  _queue = result.then(() => undefined, () => undefined);
  return result;
}

// ── Gemini REST call ──────────────────────────────────────────────────────────
async function geminiCall(prompt: string, maxTokens: number): Promise<LLMResult> {
  const t0 = Date.now();

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // thinking-off was reverted: it cost ~1 accuracy point on hard aggregation Qs.
    // The parallel rerank (accuracy-neutral) already provides the latency win.
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}:generateContent?key=${GEMINI_API_KEY()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      // Network-level failure ("fetch failed") — retry with backoff (larger prompts
      // occasionally drop the connection). Previously this surfaced as a hard error.
      const wait = [2_000, 5_000, 10_000, 15_000][attempt] ?? 15_000;
      console.warn(`[gemini] network error (attempt ${attempt + 1}): ${String(netErr).slice(0, 80)} — retry in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (res.status === 429) {
      const wait = [5_000, 15_000, 30_000][attempt] ?? 30_000;
      console.warn(`[gemini] 429 rate limit (attempt ${attempt + 1}), waiting ${wait / 1000}s…`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    return { text, model: GEMINI_MODEL, promptTokens, completionTokens, latencyMs: Date.now() - t0 };
  }

  throw new Error('geminiCall exhausted retries');
}

// ── Public generate() — used by llmOnly, basicRag, graphragPipeline ───────────
export async function generate(opts: {
  system: string;
  user: string;
  role?: 'llm' | 'rag' | 'graph';
  maxTokens?: number;
}): Promise<LLMResult> {
  // Combine system + user into a single prompt (Gemini doesn't have system role in basic API)
  const prompt = opts.system
    ? `${opts.system}\n\n${opts.user}`
    : opts.user;

  return enqueue(() => geminiCall(prompt, opts.maxTokens ?? 600));
}

// ── judge() — kept on Groq (accuracy.ts has its own separate Groq client) ─────
// This judge() is only called by compare route, not by crmEval.
const _judgeClient = () => new Groq({
  apiKey: process.env.GROQ_API_KEY_JUDGE ?? process.env.GROQ_API_KEY ?? '',
});
let _groqJudge: Groq | null = null;

export async function judge(opts: { system: string; user: string; maxTokens?: number }): Promise<LLMResult> {
  if (!_groqJudge) _groqJudge = _judgeClient();
  const t0 = Date.now();
  const model = process.env.JUDGE_MODEL ?? 'llama-3.3-70b-versatile';
  const msg = await _groqJudge.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 600,
    temperature: 0,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user',   content: opts.user },
    ],
  });
  return {
    text: msg.choices[0]?.message?.content ?? '',
    model,
    promptTokens:     msg.usage?.prompt_tokens     ?? 0,
    completionTokens: msg.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}
