// Evaluation Layer — public surface.
// Owns: independent (Sonnet) judge for question quality, persistence of bench runs,
// aggregation queries that feed the comparison dashboard.
// Depends on: llm layer (for judge calls) only.
export { judgePair, meanScore, type JudgeVerdict, type JudgeScore } from './judge.js';
export { db, insertRun, insertJudgement, aggregate, judgementSummary, type BenchRow, type JudgeRow, type Aggregate } from './store/sqlite.js';
