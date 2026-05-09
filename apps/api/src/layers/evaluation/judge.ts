import { judge as callJudge, costUsd } from '../llm/claude.js';

const SYSTEM = `You are an impartial senior engineering hiring panelist.
You will receive a candidate's repo URL and TWO anonymized sets of 5 interview questions (Set A and Set B).
You do NOT know which set came from which system.

Score each set on FIVE dimensions, each 1–5:
- specificity      (×0.20): Questions reference this repo's actual tech/files/config, not "how do you handle X in general?"
                             NOTE: mentioning a file name is only high-specificity if it implies knowledge of the internal mechanism, not just the filename.
- depth            (×0.30): Questions probe the internal mechanism, failure mode, or design trade-off — not the happy path.
                             A question that can be answered by reading the docs scores ≤2.
- fairness         (×0.15): A real builder of this repo could plausibly answer in 90 seconds without preparation.
- faker_resistance (×0.20): Someone who only read the README or asked an AI about the tech would struggle to answer convincingly.
- cross_tech       (×0.15): At least some questions require understanding how TWO or more technologies in this repo interact at their boundary
                             (e.g., cache invalidation between Redis and the frontend, message deduplication between Kafka and Postgres).
                             A set with zero cross-tech questions scores 1 on this dimension.

Weighted score = specificity*0.20 + depth*0.30 + fairness*0.15 + faker_resistance*0.20 + cross_tech*0.15
Declare the winner based on the weighted score. Ties only if weighted scores are within 0.1.

Output strict JSON — no markdown, no prose outside the object:
{"a":{"specificity":N,"depth":N,"fairness":N,"faker_resistance":N,"cross_tech":N},"b":{...},"winner":"A|B|tie","reason":"one sentence citing the decisive dimension"}`;

export interface JudgeScore {
  specificity: number; depth: number; fairness: number; faker_resistance: number; cross_tech: number;
}
export interface JudgeVerdict {
  a: JudgeScore; b: JudgeScore; winner: 'A' | 'B' | 'tie'; reason: string;
  costUsd: number; latencyMs: number;
}

export async function judgePair(
  repoUrl: string,
  setA: string[],
  setB: string[],
): Promise<JudgeVerdict> {
  const user = [
    `REPO: ${repoUrl}`,
    `SET A:\n${setA.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    `SET B:\n${setB.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  ].join('\n\n');
  const r = await callJudge({ system: SYSTEM, user, maxTokens: 600 });

  // Attempt to parse — if the model embedded prose or returned two objects,
  // grab the LAST well-formed JSON object in the output (the model sometimes
  // emits a short preamble then the real object).
  let parsed: Omit<JudgeVerdict, 'costUsd' | 'latencyMs'> | null = null;
  const candidates = [...r.text.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
  for (const candidate of candidates.reverse()) {
    try {
      const p = JSON.parse(candidate) as Record<string, unknown>;
      if (p.a && p.b && p.winner) { parsed = p as unknown as typeof parsed; break; }
    } catch { /* try next */ }
  }
  if (!parsed) throw new Error(`Judge returned non-JSON: ${r.text.slice(0, 200)}`);
  return {
    ...parsed!,
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    latencyMs: r.latencyMs,
  };
}

// Weighted mean matching the judge rubric: depth(0.30) + faker_resistance(0.20) + specificity(0.20) + cross_tech(0.15) + fairness(0.15)
export function meanScore(s: JudgeScore): number {
  return s.specificity * 0.20 + s.depth * 0.30 + s.fairness * 0.15 + s.faker_resistance * 0.20 + (s.cross_tech ?? 0) * 0.15;
}
