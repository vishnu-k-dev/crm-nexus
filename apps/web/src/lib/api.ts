// ── Types returned by POST /api/compare ─────────────────────────────────────

export interface PipelineResult {
  pipeline: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: number;
  contextChars: number;
  retrievedChunks: string[];
  error?: string;
  // GraphRAG-only
  numHops?: number;
  complexity?: string;
  complexityReason?: string;
  tgLatencyMs?: number;
  groqLatencyMs?: number;
}

export interface JudgeResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  costUsd: number;
}

export interface BertScoreResult {
  precision: number;
  recall: number;
  f1: number;
  f1Rescaled: number;
}

export interface PipelineAccuracy {
  llmJudge: JudgeResult | null;
  bertScore: BertScoreResult | null;
  efficiencyScore: number;
}

export interface QueryMeta {
  complexity: 'simple' | 'multi-hop';
  numHops: number;
  reason: string;
}

export interface TokenReduction {
  basicRagTotal: number;
  graphragTotal: number;
  reductionPct: string;
}

export interface CompareResult {
  question: string;
  llmOnly: PipelineResult;
  basicRag: PipelineResult;
  graphrag: PipelineResult;
  queryMeta: QueryMeta;
  tokenReduction?: TokenReduction;
  accuracy?: {
    basicRag: PipelineAccuracy;
    graphrag: PipelineAccuracy;
  } | null;
}

// ── Types returned by GET /api/compare/eval ──────────────────────────────────

export interface EvalRow {
  question: string;
  basicRag?: PipelineResult & { judge?: JudgeResult | null };
  graphrag?: PipelineResult & { judge?: JudgeResult | null };
  error?: string;
}

export interface EvalResult {
  n: number;
  aggregate: {
    llmJudgePassRate:        { llmOnly: string; basicRag: string; graphrag: string };
    avgBertScoreF1Rescaled:  { llmOnly: string; basicRag: string; graphrag: string; target: string };
    firstPlaceWins:          { llm: number; basicRag: number; graphrag: number };
    avgPromptTokens:         { llmOnly: number; basicRag: number; graphrag: number };
    avgLatencyMs:            { llmOnly: number; basicRag: number; graphrag: number };
    tokenReductionVsBasic:   string;
    latencyReductionVsBasic: string;
  };
  results: EvalRow[];
}

// ── Types returned by GET /api/crm-eval ──────────────────────────────────────

export interface CrmEvalRow {
  question: string;
  referenceAnswer?: string;
  type?: string;
  hops?: number;
  entities?: string[];
  llmOnly?: PipelineResult & { judge?: JudgeResult | null };
  basicRag?: PipelineResult & { judge?: JudgeResult | null };
  graphrag?: PipelineResult & { judge?: JudgeResult | null; bertScore?: BertScoreResult | null };
  error?: string;
}

export interface CrmEvalResult {
  dataset: string;
  datasetStats: {
    totalTokens: number;
    totalEntities: number;
    graphVertices: number;
    graphEdges: number;
    evalQuestions: number;
    note: string;
  };
  n: number;
  aggregate: {
    llmJudgePassRate: { llmOnly: string; basicRag: string; graphrag: string; note?: string };
    bertScoreGraphRAG: { avgF1Rescaled: number | null; n: number; target: number; note?: string };
    avgPromptTokens: { llmOnly: number; basicRag: number; graphrag: number };
    tokenReductionVsBasicRag: string;
    avgLatencyMs: { llmOnly: number; basicRag: number; graphrag: number };
    latencyReductionVsBasicRag: string;
  };
  results: CrmEvalRow[];
}

export async function runCrmEval(): Promise<CrmEvalResult> {
  const res = await fetch(`${BASE}/api/crm-eval`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `crm-eval failed: ${res.status}`);
  }
  return res.json();
}

/** Loads pre-computed results from disk — instant, no computation. */
export async function getCrmResults(): Promise<CrmEvalResult | null> {
  const res = await fetch(`${BASE}/api/crm-eval/results`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export interface SingleQuestionResult {
  question: string;
  referenceAnswer: string | null;
  llmOnly:  PipelineResult & { judge?: JudgeResult | null };
  basicRag: PipelineResult & { judge?: JudgeResult | null };
  graphrag: PipelineResult & { judge?: JudgeResult | null };
}

/** Run a single question through all 3 pipelines — fast (3 parallel calls). */
export async function askQuestion(question: string, referenceAnswer?: string): Promise<SingleQuestionResult> {
  const res = await fetch(`${BASE}/api/crm-eval/question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, referenceAnswer }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `question failed: ${res.status}`);
  }
  return res.json();
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface StatusResult {
  vectorIndexReady: boolean;
  chunkCount: number;
  graphragUrl: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

// In dev, Vite proxy forwards /api → localhost:3001. Override with VITE_API_URL for production.
const BASE = import.meta.env.VITE_API_URL ?? '';

export async function compareQuestion(
  question: string,
  referenceAnswer?: string,
  runBertScore = false,
): Promise<CompareResult> {
  const res = await fetch(`${BASE}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, referenceAnswer, runBertScore }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `compare failed: ${res.status}`);
  }
  return res.json();
}

export async function getStatus(): Promise<StatusResult> {
  const res = await fetch(`${BASE}/api/compare/status`);
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return res.json();
}

export async function runFullEval(): Promise<EvalResult> {
  const res = await fetch(`${BASE}/api/compare/eval`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `eval failed: ${res.status}`);
  }
  return res.json();
}
