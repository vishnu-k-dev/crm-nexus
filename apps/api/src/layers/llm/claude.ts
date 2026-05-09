import Groq from 'groq-sdk';

// One Groq client per pipeline role — each uses its own API key → separate daily quota
const _clients: Record<string, Groq> = {};
function client(role: 'llm' | 'rag' | 'graph' | 'judge'): Groq {
  if (!_clients[role]) {
    // Fresh keys: LLM and RAG.  GRAPH/JUDGE fall back to the fresh pair so
    // exhausted old keys don't block the benchmark.
    const freshLlm  = process.env.GROQ_API_KEY_LLM ?? process.env.GROQ_API_KEY ?? '';
    const freshRag  = process.env.GROQ_API_KEY_RAG ?? process.env.GROQ_API_KEY ?? '';
    const keyMap: Record<string, string> = {
      llm:   freshLlm,
      rag:   freshRag,
      graph: process.env.GROQ_API_KEY_GRAPH || freshLlm,   // fallback → LLM key
      judge: process.env.GROQ_API_KEY_JUDGE || freshRag,   // fallback → RAG key
    };
    const key = keyMap[role];
    if (!key) throw new Error(`GROQ_API_KEY_${role.toUpperCase()} is not set in .env`);
    _clients[role] = new Groq({ apiKey: key });
  }
  return _clients[role]!;
}

// ── Global request queue — 3s minimum gap between calls ──────────────────────
// Groq free tier: ~30 req/min for 70b. 3s gap = 20 req/min, safely under limit.
let _lastCall = 0;
let _queue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = _queue.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, _lastCall + 3_000 - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    _lastCall = Date.now();
    return fn();
  });
  _queue = result.then(() => undefined, () => undefined);
  return result;
}

const GEN   = () => process.env.GEN_MODEL   ?? 'llama-3.3-70b-versatile';
const JUDGE = () => process.env.JUDGE_MODEL ?? 'llama-3.3-70b-versatile';

export interface LLMResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

// Groq free tier — nominal price for cost comparison display
const PRICE = { in: 0.59 / 1e6, out: 0.79 / 1e6 };

export function costUsd(model: string, p: number, c: number): number {
  return p * PRICE.in + c * PRICE.out;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && i < retries - 1) {
        const wait = [10_000, 30_000, 60_000][i] ?? 60_000;
        console.warn(`[groq] 429 (attempt ${i + 1}), waiting ${wait / 1000}s…`);
        await new Promise((r) => setTimeout(r, wait));
      } else throw err;
    }
  }
  throw new Error('withRetry exhausted');
}

export async function generate(opts: { system: string; user: string; role?: 'llm' | 'rag' | 'graph'; cacheSystem?: boolean; maxTokens?: number }): Promise<LLMResult> {
  const t0 = Date.now();
  const model = GEN();
  const role: 'llm' | 'rag' | 'graph' = opts.role ?? 'llm';
  const msg = await enqueue(() => withRetry(() => client(role).chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 600,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user',   content: opts.user },
    ],
  })));
  const text = msg.choices[0]?.message?.content ?? '';
  return {
    text,
    model,
    promptTokens:     msg.usage?.prompt_tokens     ?? 0,
    completionTokens: msg.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}

export async function judge(opts: { system: string; user: string; maxTokens?: number }): Promise<LLMResult> {
  const t0 = Date.now();
  const model = JUDGE();
  const msg = await enqueue(() => withRetry(() => client('judge').chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 600,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user',   content: opts.user },
    ],
  })));
  const text = msg.choices[0]?.message?.content ?? '';
  return {
    text,
    model,
    promptTokens:     msg.usage?.prompt_tokens     ?? 0,
    completionTokens: msg.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}
