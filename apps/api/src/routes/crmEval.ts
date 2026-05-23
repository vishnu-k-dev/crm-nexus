/**
 * GET /api/crm-eval
 * Runs CRM multi-hop questions against all 3 pipelines.
 */
import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLlmOnly } from '../layers/orchestration/pipelines/llmOnly.js';
import { runBasicRag } from '../layers/orchestration/pipelines/basicRag.js';
import { runGraphRag } from '../layers/orchestration/pipelines/graphragPipeline.js';
import { llmJudge, bertScore } from '../layers/evaluation/accuracy.js';
import { isReady } from '../layers/retrieval/vectorStore.js';

interface CrmQuestion { question: string; answer: string; type: string; hops: number; entities: string[] }

export const crmEvalRoute: FastifyPluginAsync = async (app) => {

  // ── GET /api/crm-eval/results — instant, reads pre-computed file from disk ──
  app.get('/results', async (_req, reply) => {
    const dataDir = existsSync(join(process.cwd(), 'data'))
      ? join(process.cwd(), 'data')
      : join(process.cwd(), '..', '..', 'data');
    const paths = [
      join(dataDir, 'crm_eval_results.json'),
      join(dataDir, 'crm_eval_partial.json'),
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf8');
          return reply.type('application/json').send(raw);
        } catch { /* try next */ }
      }
    }
    return reply.status(404).send({ error: 'No results yet. Run the eval first.' });
  });

  // ── GET /api/crm-eval/question — run a single question through all 3 pipelines ──
  app.post('/question', async (req, reply) => {
    const { question, referenceAnswer } = req.body as { question?: string; referenceAnswer?: string };
    if (!question?.trim()) return reply.status(400).send({ error: 'question required' });

    const [llmRes, basicRes, graphRes] = await Promise.all([
      runLlmOnly(question).catch((e: Error) => ({ error: e.message })),
      isReady() ? runBasicRag(question).catch((e: Error) => ({ error: e.message })) : Promise.resolve({ error: 'Vector index not ready' }),
      runGraphRag(question).catch((e: Error) => ({ error: e.message })),
    ]);

    const llmAnswer   = 'answer' in llmRes   ? llmRes.answer   : '';
    const basicAnswer = 'answer' in basicRes  ? basicRes.answer : '';
    const graphAnswer = 'answer' in graphRes  ? graphRes.answer : '';

    const judges = referenceAnswer ? await Promise.all([
      llmAnswer   ? llmJudge(question, referenceAnswer, llmAnswer).catch(() => null)   : Promise.resolve(null),
      basicAnswer ? llmJudge(question, referenceAnswer, basicAnswer).catch(() => null) : Promise.resolve(null),
      graphAnswer ? llmJudge(question, referenceAnswer, graphAnswer).catch(() => null) : Promise.resolve(null),
    ]) : [null, null, null];

    return {
      question,
      referenceAnswer: referenceAnswer ?? null,
      llmOnly:  { ...llmRes,   judge: judges[0] },
      basicRag: { ...basicRes, judge: judges[1] },
      graphrag: { ...graphRes, judge: judges[2] },
    };
  });

  // ── GET /api/crm-eval — runs full benchmark (long-running, resumable) ──
  app.get('/', async (req, reply) => {
    // Persistent paths — inside the Docker volume so results survive container restarts
    const dataDir = existsSync(join(process.cwd(), 'data'))
      ? join(process.cwd(), 'data')
      : join(process.cwd(), '..', '..', 'data');
    const PARTIAL_PATH = join(dataDir, 'crm_eval_partial.json');
    const FINAL_PATH   = join(dataDir, 'crm_eval_results.json');

    // Find eval questions
    const evalPath = existsSync(join(dataDir, 'crm', 'eval_questions.json'))
      ? join(dataDir, 'crm', 'eval_questions.json')
      : join(process.cwd(), '..', '..', 'data', 'crm', 'eval_questions.json');

    if (!existsSync(evalPath)) {
      return reply.status(404).send({ error: 'CRM eval questions not found. Run: npx tsx scripts/generate-crm.ts' });
    }

    const questions = JSON.parse(readFileSync(evalPath, 'utf8')) as CrmQuestion[];

    // ── Resume from partial results if available ──
    // Already-computed questions are skipped; new questions are appended.
    // This means a re-run after a crash continues from where it left off.
    const existingResults: typeof results = [];
    if (existsSync(PARTIAL_PATH)) {
      try {
        const partial = JSON.parse(readFileSync(PARTIAL_PATH, 'utf8')) as { results: typeof results };
        existingResults.push(...(partial.results ?? []));
        console.log(`[crm-eval] Resuming from partial: ${existingResults.length}/${questions.length} already done`);
      } catch { /* corrupt partial — start fresh */ }
    }
    const doneQuestions = new Set(existingResults.map((r: { question: string }) => r.question));

    const results = [...existingResults];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Helper: persist current results to disk (both partial and per-question file)
    const save = () => {
      try {
        writeFileSync(PARTIAL_PATH, JSON.stringify({ n: results.length, total: questions.length, results }, null, 2), 'utf8');
      } catch { /* non-fatal */ }
    };

    for (const [idx, q] of questions.entries()) {
      // Skip questions already computed in a previous run
      if (doneQuestions.has(q.question)) {
        console.log(`[crm-eval] skip (cached) ${idx + 1}/${questions.length}: ${q.question.slice(0, 50)}`);
        continue;
      }

      console.log(`[crm-eval] ${idx + 1}/${questions.length}: ${q.question.slice(0, 60)}…`);
      try {
        const llmRes   = await runLlmOnly(q.question).catch((e: Error) => ({ error: e.message }));
        const basicRes = isReady()
          ? await runBasicRag(q.question).catch((e: Error) => ({ error: e.message }))
          : { error: 'Vector index not ready' };
        const graphRes = await runGraphRag(q.question).catch((e: Error) => ({ error: e.message }));

        const llmAnswer   = 'answer' in llmRes   ? llmRes.answer   : '';
        const basicAnswer = 'answer' in basicRes  ? basicRes.answer : '';
        const graphAnswer = 'answer' in graphRes  ? graphRes.answer : '';

        const [judgeLlm, judgeBasic, judgeGraph] = await Promise.all([
          llmAnswer   ? llmJudge(q.question, q.answer, llmAnswer).catch(() => null)   : Promise.resolve(null),
          basicAnswer ? llmJudge(q.question, q.answer, basicAnswer).catch(() => null) : Promise.resolve(null),
          graphAnswer ? llmJudge(q.question, q.answer, graphAnswer).catch(() => null) : Promise.resolve(null),
        ]);

        // BERTScore — run for GraphRAG answer (hackathon rubric requires it)
        const bertGraph = graphAnswer
          ? await bertScore(graphAnswer, q.answer).catch(() => null)
          : null;

        results.push({
          question: q.question,
          referenceAnswer: q.answer,
          type: q.type,
          hops: q.hops,
          entities: q.entities,
          llmOnly:  { ...llmRes,   judge: judgeLlm   },
          basicRag: { ...basicRes, judge: judgeBasic },
          graphrag: { ...graphRes, judge: judgeGraph, bertScore: bertGraph },
        });

        // Persist after every question — survives crashes
        save();

        await delay(500);
      } catch (err) {
        results.push({ question: q.question, error: (err as Error).message });
        await delay(2_000);
      }
    }

    // Aggregate
    const wins = { llm: 0, basicRag: 0, graphrag: 0 };
    const pass = { llm: 0, basicRag: 0, graphrag: 0 };
    const judgeCount = { llm: 0, basicRag: 0, graphrag: 0 };
    const tokenSums = { llm: 0, basicRag: 0, graphrag: 0 };
    const latSums   = { llm: 0, basicRag: 0, graphrag: 0 };
    let tokenN = 0;
    // Matched-pair token sums: only questions where BOTH BasicRAG and GraphRAG succeeded
    // (fair apples-to-apples comparison requires both pipelines to have answered)
    let matchedGrTokens = 0; let matchedBrTokens = 0; let matchedLatGr = 0; let matchedLatBr = 0; let matchedN = 0;
    let bertF1Sum = 0; let bertN = 0;

    type BertResult = { f1Rescaled: number } | null;
    type Res = { llmOnly?: { judge?: { verdict: string } | null; promptTokens?: number; latencyMs?: number };
                 basicRag?: { judge?: { verdict: string } | null; promptTokens?: number; latencyMs?: number };
                 graphrag?: { judge?: { verdict: string } | null; promptTokens?: number; latencyMs?: number; bertScore?: BertResult } };

    for (const r of results as Res[]) {
      if (r.llmOnly?.judge)  { judgeCount.llm++;     if (r.llmOnly.judge.verdict  === 'PASS') { pass.llm++;     wins.llm++; } }
      if (r.basicRag?.judge) { judgeCount.basicRag++; if (r.basicRag.judge.verdict === 'PASS') { pass.basicRag++; wins.basicRag++; } }
      if (r.graphrag?.judge) { judgeCount.graphrag++; if (r.graphrag.judge.verdict === 'PASS') { pass.graphrag++; wins.graphrag++; } }
      if (r.llmOnly?.promptTokens)  tokenSums.llm      += r.llmOnly.promptTokens;
      if (r.basicRag?.promptTokens) tokenSums.basicRag += r.basicRag.promptTokens;
      if (r.graphrag?.promptTokens) tokenSums.graphrag += r.graphrag.promptTokens;
      if (r.llmOnly?.latencyMs)  latSums.llm      += r.llmOnly.latencyMs;
      if (r.basicRag?.latencyMs) latSums.basicRag += r.basicRag.latencyMs;
      if (r.graphrag?.latencyMs) latSums.graphrag += r.graphrag.latencyMs;
      if (r.graphrag?.promptTokens) tokenN++;
      // Matched pairs (fair apples-to-apples token comparison)
      if (r.graphrag?.promptTokens && r.basicRag?.promptTokens) {
        matchedGrTokens += r.graphrag.promptTokens;
        matchedBrTokens += r.basicRag.promptTokens;
        if (r.graphrag.latencyMs) matchedLatGr += r.graphrag.latencyMs;
        if (r.basicRag.latencyMs) matchedLatBr += r.basicRag.latencyMs;
        matchedN++;
      }
      if (r.graphrag?.bertScore?.f1Rescaled != null) { bertF1Sum += r.graphrag.bertScore.f1Rescaled; bertN++; }
    }

    const n = tokenN || 1;
    const mn = matchedN || 1;
    const pct = (num: number, den: number) => den > 0 ? (num / den * 100).toFixed(1) + '%' : 'N/A';

    const payload = {
      dataset: 'Synthetic CRM (19.02M tokens / 159,338 entities)',
      datasetStats: {
        totalTokens: 19_020_000,
        totalEntities: 159_338,
        graphVertices: 159338,
        graphEdges: 478014,
        evalQuestions: results.length,
        note: '19x the 1M-token minimum threshold required by judges',
      },
      n: results.length,
      aggregate: {
        llmJudgePassRate: {
          llmOnly:  pct(pass.llm,      judgeCount.llm),
          basicRag: pct(pass.basicRag, judgeCount.basicRag),
          graphrag: pct(pass.graphrag, judgeCount.graphrag),
          note: 'GraphRAG uses TigerGraph multi-hop traversal; BasicRAG uses flat cosine similarity on the same CRM vector index.',
        },
        bertScoreGraphRAG: {
          avgF1Rescaled: bertN > 0 ? parseFloat((bertF1Sum / bertN).toFixed(3)) : null,
          n: bertN,
          target: 0.55,
          note: 'BERTScore F1 rescaled_with_baseline=True (hackathon rubric requirement)',
        },
        avgPromptTokens: {
          llmOnly:  Math.round(tokenSums.llm / n),
          basicRag: Math.round(matchedBrTokens / mn),
          graphrag: Math.round(matchedGrTokens / mn),
          note: `Averages on ${matchedN} matched-pair questions where both pipelines answered.`,
        },
        tokenReductionVsBasicRag: matchedBrTokens > 0
          ? (((matchedBrTokens - matchedGrTokens) / matchedBrTokens) * 100).toFixed(1) + '%'
          : 'N/A',
        avgLatencyMs: {
          llmOnly:  Math.round(latSums.llm / n),
          basicRag: Math.round(matchedLatBr / mn),
          graphrag: Math.round(matchedLatGr / mn),
        },
        latencyReductionVsBasicRag: matchedLatBr > 0
          ? (((matchedLatBr - matchedLatGr) / matchedLatBr) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      results,
    };

    try { writeFileSync(FINAL_PATH, JSON.stringify(payload, null, 2), 'utf8'); } catch { /* non-fatal */ }

    return payload;
  });
};
