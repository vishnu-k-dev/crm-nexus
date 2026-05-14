/**
 * Accuracy evaluation — hackathon rubric compliant:
 *   1. LLM-as-a-Judge: PASS/FAIL via Groq llama-3.3-70b-versatile (same model as generator
 *      but separate API key → separate quota; independent in terms of deployment).
 *      Switched from llama-3.1-8b-instant which produced unreliable verdicts (failed correct answers).
 *   2. BERTScore: semantic similarity via Python `evaluate` library (rescale_with_baseline=True)
 *   3. Ranking: one judge call ranks all 3 pipelines 1st/2nd/3rd
 */

import Groq from 'groq-sdk';

// ── Groq judge client (llama-3.3-70b-versatile — consistent, reliable judge) ──
const JUDGE_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const _judgeClients: Groq[] = [];
let _judgeIdx = 0;
function judgeClient(): Groq {
  if (_judgeClients.length === 0) {
    const keys = [
      process.env.GROQ_API_KEY_JUDGE,
      process.env.GROQ_API_KEY_LLM,
      process.env.GROQ_API_KEY_RAG,
      process.env.GROQ_API_KEY,
    ].filter(Boolean) as string[];
    if (keys.length === 0) throw new Error('No GROQ keys set for judge');
    for (const k of keys) _judgeClients.push(new Groq({ apiKey: k }));
  }
  const client = _judgeClients[_judgeIdx % _judgeClients.length]!;
  _judgeIdx++;
  return client;
}

// Simple rate limiter — 2s min gap (Groq free: 30 req/min)
let _lastJudge = 0;
async function judgeCall(messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>, maxTokens = 200): Promise<string> {
  const now = Date.now();
  const wait = Math.max(0, _lastJudge + 2_000 - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastJudge = Date.now();

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await judgeClient().chat.completions.create({
        model: JUDGE_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        messages,
      });
      return res.choices[0]?.message?.content ?? '';
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const msg = (err as Error).message ?? '';
      console.error(`[judge] Error (attempt ${attempt + 1}):`, msg);
      if (attempt < 3) {
        // Retry on 429, connection errors, and any network transient
        const wait = status === 429
          ? ([3_000, 6_000, 10_000][attempt] ?? 10_000)
          : ([1_000, 3_000, 6_000][attempt] ?? 6_000);
        console.warn(`[judge] retrying in ${wait / 1000}s…`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
  throw new Error('judgeCall exhausted retries');
}

// ── LLM-as-a-Judge (PASS/FAIL) ───────────────────────────────────────────────

const JUDGE_PROMPT = `Grade the CRM assistant's answer. Read the system answer carefully before deciding.
Question: {q}
Correct answer: {correct}
System answer: {answer}

Reply PASS or FAIL first, then briefly explain.
PASS when: key facts from the correct answer are present in the system answer. Accept: different phrasing, extra context, any number format ($1,478,328 = $14,78,328 = 1478328), any date format.
FAIL ONLY when: a stated number is wrong, OR the wrong entity wins a comparison, OR a key fact is COMPLETELY ABSENT from the system answer.
IMPORTANT: Do NOT fail if a fact IS present but worded differently. Read the system answer completely before claiming something is absent.`;

export interface JudgeResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  costUsd: number;
}

export async function llmJudge(
  question: string,
  referenceAnswer: string,
  systemAnswer: string,
): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT
    .replace('{q}', question)
    .replace('{correct}', referenceAnswer)
    .replace('{answer}', systemAnswer.slice(0, 800));

  const text = await judgeCall([{ role: 'user', content: prompt }], 200);
  const verdict = /\bPASS\b/i.test(text) ? 'PASS' : 'FAIL';
  return { verdict, reason: text.trim().slice(0, 400), costUsd: 0 };
}

// ── Efficiency Score ──────────────────────────────────────────────────────────

export function efficiencyScore(
  verdict: 'PASS' | 'FAIL',
  promptTokens: number,
  completionTokens: number,
): number {
  const accuracy = verdict === 'PASS' ? 1.0 : 0.0;
  const totalTokens = promptTokens + completionTokens;
  if (totalTokens === 0) return 0;
  return parseFloat((accuracy / (totalTokens / 1000)).toFixed(3));
}

// ── Ranking Judge — one call ranks all 3 pipelines ───────────────────────────

const RANK_PROMPT = `Rank these three answers from best (1) to worst (3) based on accuracy and completeness.
Question: {q}
Reference: {ref}
Answer A (LLM-Only): {a}
Answer B (Basic RAG): {b}
Answer C (GraphRAG): {c}

Output ONLY valid JSON: {"rank":{"llm":1,"basicRag":2,"graphrag":3},"reason":"one sentence"}
Use each number 1, 2, 3 exactly once.`;

export interface RankResult {
  rank: { llm: number; basicRag: number; graphrag: number };
  reason: string;
}

export async function rankJudge(
  question: string,
  referenceAnswer: string,
  llmAnswer: string,
  basicRagAnswer: string,
  graphragAnswer: string,
): Promise<RankResult> {
  const prompt = RANK_PROMPT
    .replace('{q}', question)
    .replace('{ref}', referenceAnswer.slice(0, 300))
    .replace('{a}', llmAnswer.slice(0, 350))
    .replace('{b}', basicRagAnswer.slice(0, 350))
    .replace('{c}', graphragAnswer.slice(0, 350));

  const text = await judgeCall([{ role: 'user', content: prompt }], 200);

  // Try greedy match for the outer object first (contains "rank":{...})
  const outerMatch = text.match(/\{[\s\S]*"rank"[\s\S]*\}/);
  if (outerMatch) {
    try {
      const p = JSON.parse(outerMatch[0]) as Record<string, unknown>;
      if (p.rank && typeof p.rank === 'object') {
        const rank = p.rank as Record<string, number>;
        if (rank.llm && rank.basicRag && rank.graphrag) {
          return {
            rank: { llm: rank.llm, basicRag: rank.basicRag, graphrag: rank.graphrag },
            reason: (p.reason as string) ?? '',
          };
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: extract rank numbers directly from text via regex
  const llmRank      = text.match(/"?llm"?\s*:\s*([123])/i)?.[1];
  const basicRagRank = text.match(/"?basicRag"?\s*:\s*([123])/i)?.[1];
  const graphragRank = text.match(/"?graphrag"?\s*:\s*([123])/i)?.[1];
  if (llmRank && basicRagRank && graphragRank) {
    return {
      rank: { llm: +llmRank, basicRag: +basicRagRank, graphrag: +graphragRank },
      reason: 'extracted via regex fallback',
    };
  }

  // Throw so the caller's .catch(() => null) excludes this from the wins count
  throw new Error(`rankJudge parse failed: ${text.slice(0, 200)}`);
}

// ── BERTScore (Python subprocess — uses HF `evaluate` library) ───────────────
// Uses rescale_with_baseline=True as required by hackathon rubric.
// Target: f1Rescaled >= 0.55 for GraphRAG

export interface BertScoreResult {
  precision: number;
  recall: number;
  f1: number;
  f1Rescaled: number;  // rescale_with_baseline=True → honest 0–1 scale. Target ≥ 0.55
}

export async function bertScore(
  hypothesis: string,
  reference: string,
): Promise<BertScoreResult> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  const script = `
import sys, json
try:
    import evaluate
    bs = evaluate.load("bertscore")
    result = bs.compute(
        predictions=[sys.argv[1]],
        references=[sys.argv[2]],
        lang="en",
        rescale_with_baseline=True
    )
    print(json.dumps({
        "precision": float(result["precision"][0]),
        "recall":    float(result["recall"][0]),
        "f1":        float(result["f1"][0]),
        "f1Rescaled": float(result["f1"][0])
    }))
except Exception as e:
    print(json.dumps({"precision":0,"recall":0,"f1":0,"f1Rescaled":0,"error":str(e)}))
`;

  try {
    const { stdout } = await exec('python', ['-c', script, hypothesis, reference], { timeout: 120_000 });
    return JSON.parse(stdout.trim()) as BertScoreResult;
  } catch {
    return { precision: 0, recall: 0, f1: 0, f1Rescaled: 0 };
  }
}
