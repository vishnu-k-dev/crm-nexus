/**
 * POST /compare   — runs all 3 pipelines on one question, returns side-by-side results
 * GET  /compare/eval — runs the full eval set (50 questions) and returns aggregate metrics
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLlmOnly } from '../layers/orchestration/pipelines/llmOnly.js';
import { runBasicRag } from '../layers/orchestration/pipelines/basicRag.js';
import { runGraphRag } from '../layers/orchestration/pipelines/graphragPipeline.js';
import { llmJudge, bertScore, efficiencyScore, rankJudge } from '../layers/evaluation/accuracy.js';
import { analyzeQuery } from '../layers/orchestration/queryAnalyzer.js';
import { isReady, getChunkCount } from '../layers/retrieval/vectorStore.js';

const CompareBody = z.object({
  question: z.string().min(5).max(500),
  referenceAnswer: z.string().optional(),  // if provided, runs accuracy eval
  runBertScore: z.boolean().default(false), // BERTScore is slow — opt-in
});

export const compareRoute: FastifyPluginAsync = async (app) => {

  // ── Single question comparison ──────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const { question, referenceAnswer, runBertScore } = CompareBody.parse(req.body);

    // Run all 3 pipelines in parallel — Basic RAG will error gracefully if index not ready
    const [llmOnly, basicRag, graphrag] = await Promise.allSettled([
      runLlmOnly(question),
      isReady() ? runBasicRag(question) : Promise.reject(new Error('Vector index still building — check back in a few minutes')),
      runGraphRag(question),
    ]);

    const results = {
      question,
      llmOnly:  llmOnly.status  === 'fulfilled' ? llmOnly.value  : { error: (llmOnly  as PromiseRejectedResult).reason?.message },
      basicRag: basicRag.status === 'fulfilled' ? basicRag.value : { error: (basicRag as PromiseRejectedResult).reason?.message },
      graphrag: graphrag.status === 'fulfilled' ? graphrag.value : { error: (graphrag as PromiseRejectedResult).reason?.message },
      accuracy: null as unknown,
    };

    // Query complexity analysis (drives adaptive GraphRAG hops)
    const queryMeta = analyzeQuery(question);
    (results as Record<string, unknown>).queryMeta = queryMeta;

    // Token reduction summary — prompt tokens only (measures retrieval efficiency,
    // not answer length which varies by pipeline design)
    if (basicRag.status === 'fulfilled' && graphrag.status === 'fulfilled') {
      const bPrompt = basicRag.value.promptTokens;
      const gPrompt = graphrag.value.promptTokens;
      (results as Record<string, unknown>).tokenReduction = {
        basicRagPrompt:  bPrompt,
        graphragPrompt:  gPrompt,
        basicRagTotal:   basicRag.value.promptTokens + basicRag.value.completionTokens,
        graphragTotal:   graphrag.value.promptTokens + graphrag.value.completionTokens,
        reductionPct:    (((bPrompt - gPrompt) / bPrompt) * 100).toFixed(1) + '%',
        note: 'Prompt token reduction — the retrieval efficiency metric',
      };
    }

    // Optional accuracy eval
    if (referenceAnswer) {
      const [llmJudgeBasic, llmJudgeGraph] = await Promise.allSettled([
        basicRag.status  === 'fulfilled' ? llmJudge(question, referenceAnswer, basicRag.value.answer)  : Promise.reject(),
        graphrag.status  === 'fulfilled' ? llmJudge(question, referenceAnswer, graphrag.value.answer) : Promise.reject(),
      ]);

      let bertBasic, bertGraph;
      if (runBertScore) {
        [bertBasic, bertGraph] = await Promise.allSettled([
          basicRag.status === 'fulfilled'
            ? bertScore(basicRag.value.answer, referenceAnswer) : Promise.reject(),
          graphrag.status === 'fulfilled'
            ? bertScore(graphrag.value.answer, referenceAnswer) : Promise.reject(),
        ]);
      }

      results.accuracy = {
        basicRag: {
          llmJudge: llmJudgeBasic.status === 'fulfilled' ? llmJudgeBasic.value : null,
          bertScore: bertBasic?.status === 'fulfilled' ? bertBasic.value : null,
          efficiencyScore: basicRag.status === 'fulfilled'
            ? efficiencyScore(
                llmJudgeBasic.status === 'fulfilled' ? llmJudgeBasic.value.verdict : 'FAIL',
                basicRag.value.promptTokens, basicRag.value.completionTokens,
              )
            : 0,
        },
        graphrag: {
          llmJudge: llmJudgeGraph.status === 'fulfilled' ? llmJudgeGraph.value : null,
          bertScore: bertGraph?.status === 'fulfilled' ? bertGraph.value : null,
          efficiencyScore: graphrag.status === 'fulfilled'
            ? efficiencyScore(
                llmJudgeGraph.status === 'fulfilled' ? llmJudgeGraph.value.verdict : 'FAIL',
                graphrag.value.promptTokens, graphrag.value.completionTokens,
              )
            : 0,
        },
      };
    }

    return results;
  });

  // ── Status endpoint ─────────────────────────────────────────────────────
  app.get('/status', async () => {
    return {
      vectorIndexReady: isReady(),
      chunkCount: getChunkCount(),
      graphragUrl: process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000',
    };
  });

  // ── Full eval set benchmark ─────────────────────────────────────────────
  app.get('/eval', async (req, reply) => {
    // Resolve from project root (server runs from apps/api, data is at root)
    const evalPath = existsSync(join(process.cwd(), 'data', 'eval_questions.json'))
      ? join(process.cwd(), 'data', 'eval_questions.json')
      : join(process.cwd(), '..', '..', 'data', 'eval_questions.json');
    if (!existsSync(evalPath)) {
      return reply.status(404).send({ error: 'eval_questions.json not found. Run scripts/generate-eval.ts first.' });
    }

    interface EvalQ { question: string; answer: string }
    const questions = JSON.parse(readFileSync(evalPath, 'utf8')) as EvalQ[];
    const results = [];

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const [idx, q] of questions.entries()) {
      console.log(`[eval] ${idx + 1}/${questions.length}: ${q.question.slice(0, 60)}…`);
      try {
        // Run pipelines sequentially to avoid Groq burst — queue handles spacing
        const llmRes  = await runLlmOnly(q.question).catch((e: Error) => ({ error: e.message }));
        const basicRes = isReady()
          ? await runBasicRag(q.question).catch((e: Error) => ({ error: e.message }))
          : { error: 'Vector index not ready' };
        const graphRes = await runGraphRag(q.question).catch((e: Error) => ({ error: e.message }));

        const llmAnswer   = 'answer' in llmRes   ? llmRes.answer   : '';
        const basicAnswer = 'answer' in basicRes  ? basicRes.answer : '';
        const graphAnswer = 'answer' in graphRes  ? graphRes.answer : '';

        // HF judge: PASS/FAIL per pipeline (sequential — HF rate limit 30 req/min)
        const [judgeLlm, judgeBasic, judgeGraph] = await Promise.all([
          llmAnswer   ? llmJudge(q.question, q.answer, llmAnswer).catch(() => null)   : Promise.resolve(null),
          basicAnswer ? llmJudge(q.question, q.answer, basicAnswer).catch(() => null) : Promise.resolve(null),
          graphAnswer ? llmJudge(q.question, q.answer, graphAnswer).catch(() => null) : Promise.resolve(null),
        ]);

        // Rank all 3 in one HF call
        let ranking = null;
        if (llmAnswer || basicAnswer || graphAnswer) {
          ranking = await rankJudge(q.question, q.answer, llmAnswer, basicAnswer, graphAnswer)
            .catch(() => null);
        }

        // BERTScore disabled for speed — runs separately after eval
        const [llmBert, basicBert, graphBert] = [null, null, null];

        results.push({
          question: q.question,
          referenceAnswer: q.answer,
          llmOnly:  { ...llmRes,   judge: judgeLlm,   bertScore: llmBert   },
          basicRag: { ...basicRes, judge: judgeBasic, bertScore: basicBert },
          graphrag: { ...graphRes, judge: judgeGraph, bertScore: graphBert },
          ranking,
        });

        // Save after every question — interruptions won't lose progress
        try {
          writeFileSync(
            join(process.cwd(), '..', '..', 'eval_results_partial.json'),
            JSON.stringify({ n: results.length, results }, null, 2), 'utf8'
          );
        } catch { /* non-fatal */ }

        await delay(500);
      } catch (err) {
        results.push({ question: q.question, error: (err as Error).message });
        await delay(5_000);
      }
    }

    type PipelineItem = { promptTokens?: number; latencyMs?: number; judge?: { verdict: string } | null; bertScore?: { f1Rescaled: number } | null };
    type ResItem = {
      llmOnly?:  PipelineItem;
      basicRag?: PipelineItem;
      graphrag?: PipelineItem;
      ranking?:  { rank: { llm: number; basicRag: number; graphrag: number } } | null;
    };

    const wins        = { llm: 0, basicRag: 0, graphrag: 0 };
    const pass        = { llm: 0, basicRag: 0, graphrag: 0 };
    const judgeCount  = { llm: 0, basicRag: 0, graphrag: 0 };
    const tokenSums   = { llm: 0, basicRag: 0, graphrag: 0 };
    const latencySums = { llm: 0, basicRag: 0, graphrag: 0 };
    let tokenCount = 0;
    const bertSums  = { llm: 0, basicRag: 0, graphrag: 0 };
    const bertCounts = { llm: 0, basicRag: 0, graphrag: 0 };

    for (const r of results as ResItem[]) {
      if (r.ranking?.rank) {
        const rank = r.ranking.rank;
        if (rank.llm      === 1) wins.llm++;
        if (rank.basicRag === 1) wins.basicRag++;
        if (rank.graphrag === 1) wins.graphrag++;
      }
      if (r.llmOnly?.judge)  { judgeCount.llm++;     if (r.llmOnly.judge.verdict  === 'PASS') pass.llm++; }
      if (r.basicRag?.judge) { judgeCount.basicRag++; if (r.basicRag.judge.verdict === 'PASS') pass.basicRag++; }
      if (r.graphrag?.judge) { judgeCount.graphrag++; if (r.graphrag.judge.verdict === 'PASS') pass.graphrag++; }
      if (r.llmOnly?.promptTokens)  tokenSums.llm      += r.llmOnly.promptTokens;
      if (r.basicRag?.promptTokens) tokenSums.basicRag += r.basicRag.promptTokens;
      if (r.graphrag?.promptTokens) tokenSums.graphrag += r.graphrag.promptTokens;
      if (r.llmOnly?.latencyMs)  latencySums.llm      += r.llmOnly.latencyMs;
      if (r.basicRag?.latencyMs) latencySums.basicRag += r.basicRag.latencyMs;
      if (r.graphrag?.latencyMs) latencySums.graphrag += r.graphrag.latencyMs;
      if (r.llmOnly?.bertScore?.f1Rescaled  != null) { bertSums.llm      += r.llmOnly.bertScore.f1Rescaled;  bertCounts.llm++; }
      if (r.basicRag?.bertScore?.f1Rescaled != null) { bertSums.basicRag += r.basicRag.bertScore.f1Rescaled; bertCounts.basicRag++; }
      if (r.graphrag?.bertScore?.f1Rescaled != null) { bertSums.graphrag += r.graphrag.bertScore.f1Rescaled; bertCounts.graphrag++; }
      if (r.llmOnly?.promptTokens || r.basicRag?.promptTokens || r.graphrag?.promptTokens) tokenCount++;
    }
    const n = tokenCount || 1;
    const pct = (num: number, den: number) => den > 0 ? (num / den * 100).toFixed(1) + '%' : 'N/A';

    const payload = {
      n: results.length,
      aggregate: {
        // ── Primary accuracy metrics (hackathon rubric) ──
        llmJudgePassRate: {
          llmOnly:  pct(pass.llm,      judgeCount.llm),
          basicRag: pct(pass.basicRag, judgeCount.basicRag),
          graphrag: pct(pass.graphrag, judgeCount.graphrag),
        },
        avgBertScoreF1Rescaled: {
          llmOnly:  bertCounts.llm      > 0 ? (bertSums.llm      / bertCounts.llm).toFixed(3)      : 'N/A',
          basicRag: bertCounts.basicRag > 0 ? (bertSums.basicRag / bertCounts.basicRag).toFixed(3) : 'N/A',
          graphrag: bertCounts.graphrag > 0 ? (bertSums.graphrag / bertCounts.graphrag).toFixed(3) : 'N/A',
          target: '≥ 0.55 for GraphRAG',
        },
        // ── Efficiency metrics ──
        firstPlaceWins: wins,
        avgPromptTokens: {
          llmOnly:  Math.round(tokenSums.llm / n),
          basicRag: Math.round(tokenSums.basicRag / n),
          graphrag: Math.round(tokenSums.graphrag / n),
        },
        avgLatencyMs: {
          llmOnly:  Math.round(latencySums.llm / n),
          basicRag: Math.round(latencySums.basicRag / n),
          graphrag: Math.round(latencySums.graphrag / n),
        },
        tokenReductionVsBasic: tokenSums.basicRag > 0
          ? (((tokenSums.basicRag - tokenSums.graphrag) / tokenSums.basicRag) * 100).toFixed(1) + '%'
          : 'N/A',
        latencyReductionVsBasic: latencySums.basicRag > 0
          ? (((latencySums.basicRag - latencySums.graphrag) / latencySums.basicRag) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      results,
    };

    // Always save to disk — client timeouts won't lose the results
    const outPath = join(process.cwd(), '..', '..', 'eval_results.json');
    try {
      writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[eval] Results saved to ${outPath}`);
    } catch (e) {
      console.error('[eval] Failed to save results:', e);
    }

    return payload;
  });
};
