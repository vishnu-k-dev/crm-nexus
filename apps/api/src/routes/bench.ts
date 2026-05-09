import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { runBaseline } from '../layers/orchestration/pipelines/baseline.js';
import { runGraphRag } from '../layers/orchestration/pipelines/graphrag.js';
import { judgePair, meanScore } from '../layers/evaluation/judge.js';
import { aggregate, insertJudgement, insertRun, judgementSummary } from '../layers/evaluation/store/sqlite.js';

const RunBody = z.object({
  evalSetPath: z.string().default(process.env.EVAL_SET_PATH ?? './data/eval_set.json'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().positive().optional(),
  judge: z.boolean().default(true),
});

interface EvalEntry { repoUrl: string; archetype: string; resume?: string }

export const benchRoute: FastifyPluginAsync = async (app) => {
  app.post('/run', async (req) => {
    const { evalSetPath, offset, limit, judge } = RunBody.parse(req.body);
    const set = JSON.parse(readFileSync(evalSetPath, 'utf8')) as EvalEntry[];
    const subset = set.slice(offset, limit ? offset + limit : undefined);
    const runId = `run_${Date.now()}`;
    const events: unknown[] = [];

    for (const item of subset) {
      try {
        // Small gap between repos to stay within Groq's RPM limit.
        if (events.length > 0) await new Promise((r) => setTimeout(r, 2000));
        // Run sequentially — avoids simultaneous large-context calls.
        const b = await runBaseline(item.repoUrl, item.resume ?? '');
        const g = await runGraphRag(item.repoUrl, item.resume ?? '');
        for (const r of [b, g] as const) {
          insertRun({
            run_id: runId,
            pipeline: r.pipeline,
            repo_url: item.repoUrl,
            prompt_tokens: r.promptTokens,
            completion_tokens: r.completionTokens,
            latency_ms: r.latencyMs,
            cost_usd: r.costUsd,
            context_chars: r.contextChars,
            questions_json: JSON.stringify(r.questions),
          });
        }
        events.push({ kind: 'pair', repo: item.repoUrl, baseline: summarize(b), graphrag: summarize(g) });

        if (judge) {
          const swap: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
          const setA = swap === 0 ? b.questions.map((q) => q.text) : g.questions.map((q) => q.text);
          const setB = swap === 0 ? g.questions.map((q) => q.text) : b.questions.map((q) => q.text);
          const v = await judgePair(item.repoUrl, setA, setB);
          const winner = v.winner === 'tie' ? 'tie' : (v.winner === 'A' ? (swap === 0 ? 'baseline' : 'graphrag') : (swap === 0 ? 'graphrag' : 'baseline'));
          insertJudgement({
            run_id: runId, repo_url: item.repoUrl, swap,
            a_spec: v.a.specificity, a_depth: v.a.depth, a_fair: v.a.fairness, a_faker: v.a.faker_resistance, a_cross_tech: v.a.cross_tech ?? 1,
            b_spec: v.b.specificity, b_depth: v.b.depth, b_fair: v.b.fairness, b_faker: v.b.faker_resistance, b_cross_tech: v.b.cross_tech ?? 1,
            winner, reason: v.reason, judge_cost_usd: v.costUsd,
          });
          events.push({ kind: 'judge', repo: item.repoUrl, winner, a: meanScore(v.a), b: meanScore(v.b) });
        }
      } catch (err) {
        events.push({ kind: 'error', repo: item.repoUrl, message: (err as Error).message });
      }
    }

    return { runId, n: subset.length, events, aggregate: aggregate(runId), judgements: judgementSummary(runId) };
  });

  app.get('/results', async (req) => {
    const runId = (req.query as { runId?: string }).runId;
    return { aggregate: aggregate(runId), judgements: judgementSummary(runId) };
  });
};

function summarize(r: { promptTokens: number; completionTokens: number; latencyMs: number; costUsd: number; questions: unknown[] }): unknown {
  return { pTok: r.promptTokens, cTok: r.completionTokens, ms: r.latencyMs, usd: r.costUsd, qs: r.questions.length };
}
