import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Ensure .env is loaded relative to monorepo root
const here = fileURLToPath(import.meta.url);
import { config } from 'dotenv';
config({ path: resolve(here, '../../.env'), override: true });

import { runBaseline } from '../apps/api/src/layers/orchestration/pipelines/baseline.js';
import { runGraphRag } from '../apps/api/src/layers/orchestration/pipelines/graphrag.js';
import { judgePair, meanScore } from '../apps/api/src/layers/evaluation/judge.js';
import { insertRun, insertJudgement, aggregate, judgementSummary } from '../apps/api/src/layers/evaluation/store/sqlite.js';

interface EvalEntry { repoUrl: string; archetype: string; resume?: string }

const evalSetPath = process.env.EVAL_SET_PATH ?? './data/eval_set.json';
const limitArg = process.argv[2] ? Number(process.argv[2]) : undefined;
const offsetArg = process.argv[3] ? Number(process.argv[3]) : 0;

const set = JSON.parse(readFileSync(evalSetPath, 'utf8')) as EvalEntry[];
const subset = set.slice(offsetArg, limitArg ? offsetArg + limitArg : undefined);

const runId = `run_${Date.now()}`;
console.log(`\n[bench] runId=${runId}  repos ${offsetArg + 1}–${offsetArg + subset.length} of ${set.length}\n`);

let passed = 0;
let failed = 0;

for (const [i, item] of subset.entries()) {
  process.stdout.write(`[${i + 1}/${subset.length}] ${item.repoUrl} … `);
  try {
    const b = await runBaseline(item.repoUrl, item.resume ?? '');
    const g = await runGraphRag(item.repoUrl, item.resume ?? '');

    for (const r of [b, g]) {
      insertRun({
        run_id: runId, pipeline: r.pipeline, repo_url: item.repoUrl,
        prompt_tokens: r.promptTokens, completion_tokens: r.completionTokens,
        latency_ms: r.latencyMs, cost_usd: r.costUsd,
        context_chars: r.contextChars, questions_json: JSON.stringify(r.questions),
      });
    }

    const swap: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const setA = swap === 0 ? b.questions.map(q => q.text) : g.questions.map(q => q.text);
    const setB = swap === 0 ? g.questions.map(q => q.text) : b.questions.map(q => q.text);
    const v = await judgePair(item.repoUrl, setA, setB);
    const winner = v.winner === 'tie' ? 'tie' : (v.winner === 'A' ? (swap === 0 ? 'baseline' : 'graphrag') : (swap === 0 ? 'graphrag' : 'baseline'));

    insertJudgement({
      run_id: runId, repo_url: item.repoUrl, swap,
      a_spec: v.a.specificity, a_depth: v.a.depth, a_fair: v.a.fairness,
      a_faker: v.a.faker_resistance, a_cross_tech: v.a.cross_tech ?? 1,
      b_spec: v.b.specificity, b_depth: v.b.depth, b_fair: v.b.fairness,
      b_faker: v.b.faker_resistance, b_cross_tech: v.b.cross_tech ?? 1,
      winner, reason: v.reason, judge_cost_usd: v.costUsd,
    });

    const gScore = meanScore(swap === 0 ? v.b : v.a);
    const bScore = meanScore(swap === 0 ? v.a : v.b);
    console.log(`✓  winner=${winner}  graphrag=${gScore.toFixed(2)} baseline=${bScore.toFixed(2)}`);
    passed++;
  } catch (err) {
    console.log(`✗  ${(err as Error).message.slice(0, 120)}`);
    failed++;
  }

  // Small gap to respect Groq RPM limits
  if (i < subset.length - 1) await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n── Results (${passed} passed, ${failed} failed) ──`);
console.log('Aggregate:');
console.table(aggregate(runId));
console.log('Judge winners:');
console.table(judgementSummary(runId));
