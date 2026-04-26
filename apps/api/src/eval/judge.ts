import { judge as callJudge, costUsd } from '../llm/claude.js';

const SYSTEM = `You are an impartial senior engineering hiring panelist.
You will receive a candidate's repo URL and TWO anonymized sets of 5 interview questions (Set A and Set B).
You do NOT know which set came from which system.
Score each set on four dimensions, 1..5:
- specificity: questions reference the actual repo / tech, not generic "tell me about X"
- depth: questions probe internal mechanism, not surface
- fairness: a real builder of this repo could plausibly answer in 90s
- faker_resistance: someone who only skimmed the README would struggle
Then give an overall winner: "A", "B", or "tie".
Output strict JSON: {"a":{"specificity":N,"depth":N,"fairness":N,"faker_resistance":N},"b":{...},"winner":"A|B|tie","reason":"..."}`;

export interface JudgeScore {
  specificity: number; depth: number; fairness: number; faker_resistance: number;
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
  const m = r.text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Judge returned non-JSON: ${r.text.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]) as Omit<JudgeVerdict, 'costUsd' | 'latencyMs'>;
  return {
    ...parsed,
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    latencyMs: r.latencyMs,
  };
}

export function meanScore(s: JudgeScore): number {
  return (s.specificity + s.depth + s.fairness + s.faker_resistance) / 4;
}
