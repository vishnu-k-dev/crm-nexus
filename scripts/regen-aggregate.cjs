// Regenerate the full CrmEvalResult payload (dataset/datasetStats/aggregate/results)
// from a raw {n,total,results} eval file — replicating apps/api/src/routes/crmEval.ts exactly.
const fs = require('fs');
const SRC = process.argv[2] || 'data/crm_eval_results.json';

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const results = raw.results || raw;

const pass = { llm: 0, basicRag: 0, graphrag: 0 };
const judgeCount = { llm: 0, basicRag: 0, graphrag: 0 };
const tokenSums = { llm: 0, basicRag: 0, graphrag: 0 };
const latSums = { llm: 0, basicRag: 0, graphrag: 0 };
let tokenN = 0, matchedGrTokens = 0, matchedBrTokens = 0, matchedLatGr = 0, matchedLatBr = 0, matchedN = 0;
let bertF1Sum = 0, bertN = 0;
const getVerdict = p => p?.judge?.verdict ?? p?.verdict ?? null;

for (const r of results) {
  const lv = getVerdict(r.llmOnly), bv = getVerdict(r.basicRag), gv = getVerdict(r.graphrag);
  if (lv) { judgeCount.llm++; if (lv === 'PASS') pass.llm++; }
  if (bv) { judgeCount.basicRag++; if (bv === 'PASS') pass.basicRag++; }
  if (gv) { judgeCount.graphrag++; if (gv === 'PASS') pass.graphrag++; }
  if (r.llmOnly?.promptTokens)  tokenSums.llm      += r.llmOnly.promptTokens;
  if (r.basicRag?.promptTokens) tokenSums.basicRag += r.basicRag.promptTokens;
  if (r.graphrag?.promptTokens) tokenSums.graphrag += r.graphrag.promptTokens;
  if (r.llmOnly?.latencyMs)  latSums.llm      += r.llmOnly.latencyMs;
  if (r.basicRag?.latencyMs) latSums.basicRag += r.basicRag.latencyMs;
  if (r.graphrag?.latencyMs) latSums.graphrag += r.graphrag.latencyMs;
  if (r.graphrag?.promptTokens) tokenN++;
  if (r.graphrag?.promptTokens && r.basicRag?.promptTokens) {
    matchedGrTokens += r.graphrag.promptTokens; matchedBrTokens += r.basicRag.promptTokens;
    if (r.graphrag.latencyMs) matchedLatGr += r.graphrag.latencyMs;
    if (r.basicRag.latencyMs) matchedLatBr += r.basicRag.latencyMs;
    matchedN++;
  }
  const bs = r.graphrag?.bertScore;
  const bsVal = bs == null ? null : typeof bs === 'number' ? bs : (bs.f1Rescaled ?? bs.f1 ?? null);
  if (bsVal != null) { bertF1Sum += bsVal; bertN++; }
}
const n = tokenN || 1, mn = matchedN || 1;
const pct = (num, den) => den > 0 ? (num / den * 100).toFixed(1) + '%' : 'N/A';

const payload = {
  dataset: 'Synthetic CRM core (158.5M tokens / 100,820 documents)',
  datasetStats: {
    totalTokens: 158_500_000, totalEntities: 159_338,
    graphVertices: 159338, graphEdges: 478014,
    evalQuestions: results.length,
    note: '1.58x the 100M-token minimum threshold required by judges',
  },
  n: results.length,
  aggregate: {
    llmJudgePassRate: {
      llmOnly: pct(pass.llm, judgeCount.llm),
      basicRag: pct(pass.basicRag, judgeCount.basicRag),
      graphrag: pct(pass.graphrag, judgeCount.graphrag),
      note: 'GraphRAG uses TigerGraph multi-hop traversal; BasicRAG uses flat cosine similarity on the same CRM vector index.',
    },
    bertScoreGraphRAG: {
      avgF1Rescaled: bertN > 0 ? parseFloat((bertF1Sum / bertN).toFixed(3)) : null,
      n: bertN, target: 0.55,
      note: 'BERTScore F1 rescaled_with_baseline=True (hackathon rubric requirement)',
    },
    avgPromptTokens: {
      llmOnly: Math.round(tokenSums.llm / n),
      basicRag: Math.round(matchedBrTokens / mn),
      graphrag: Math.round(matchedGrTokens / mn),
      note: `Averages on ${matchedN} matched-pair questions where both pipelines answered.`,
    },
    tokenReductionVsBasicRag: matchedBrTokens > 0 ? (((matchedBrTokens - matchedGrTokens) / matchedBrTokens) * 100).toFixed(1) + '%' : 'N/A',
    avgLatencyMs: {
      llmOnly: Math.round(latSums.llm / n),
      basicRag: Math.round(matchedLatBr / mn),
      graphrag: Math.round(matchedLatGr / mn),
    },
    latencyReductionVsBasicRag: matchedLatBr > 0 ? (((matchedLatBr - matchedLatGr) / matchedLatBr) * 100).toFixed(1) + '%' : 'N/A',
  },
  results,
};

fs.writeFileSync(SRC, JSON.stringify(payload, null, 2), 'utf8');
console.log('Regenerated', SRC);
console.log('GraphRAG pass:', payload.aggregate.llmJudgePassRate.graphrag,
  '| BasicRAG:', payload.aggregate.llmJudgePassRate.basicRag,
  '| LLM:', payload.aggregate.llmJudgePassRate.llmOnly);
console.log('Token reduction:', payload.aggregate.tokenReductionVsBasicRag,
  '| Latency reduction:', payload.aggregate.latencyReductionVsBasicRag,
  '| BERTScore F1:', payload.aggregate.bertScoreGraphRAG.avgF1Rescaled);
console.log('Avg tokens — GR:', payload.aggregate.avgPromptTokens.graphrag, 'BR:', payload.aggregate.avgPromptTokens.basicRag);
