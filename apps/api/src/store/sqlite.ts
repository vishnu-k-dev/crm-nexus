import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const path = process.env.BENCH_DB_PATH ?? './data/bench.sqlite';
mkdirSync(dirname(path), { recursive: true });

export const db = new Database(path);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS bench_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  pipeline TEXT NOT NULL CHECK (pipeline IN ('baseline','graphrag')),
  repo_url TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  context_chars INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_bench_runs_run ON bench_runs(run_id);

CREATE TABLE IF NOT EXISTS bench_judgements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  swap INTEGER NOT NULL,                -- 0 = A=baseline, 1 = A=graphrag (used to de-bias)
  a_specificity REAL, a_depth REAL, a_fairness REAL, a_faker REAL,
  b_specificity REAL, b_depth REAL, b_fairness REAL, b_faker REAL,
  winner TEXT NOT NULL,                 -- 'baseline'|'graphrag'|'tie'
  reason TEXT,
  judge_cost_usd REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`);

export interface BenchRow {
  run_id: string; pipeline: 'baseline'|'graphrag'; repo_url: string;
  prompt_tokens: number; completion_tokens: number; latency_ms: number;
  cost_usd: number; context_chars: number; questions_json: string;
}

const insertRunStmt = db.prepare(`
INSERT INTO bench_runs (run_id, pipeline, repo_url, prompt_tokens, completion_tokens, latency_ms, cost_usd, context_chars, questions_json)
VALUES (@run_id, @pipeline, @repo_url, @prompt_tokens, @completion_tokens, @latency_ms, @cost_usd, @context_chars, @questions_json)
`);
export const insertRun = (r: BenchRow): void => { insertRunStmt.run(r); };

const insertJudgeStmt = db.prepare(`
INSERT INTO bench_judgements (run_id, repo_url, swap,
  a_specificity, a_depth, a_fairness, a_faker,
  b_specificity, b_depth, b_fairness, b_faker,
  winner, reason, judge_cost_usd)
VALUES (@run_id, @repo_url, @swap,
  @a_spec, @a_depth, @a_fair, @a_faker,
  @b_spec, @b_depth, @b_fair, @b_faker,
  @winner, @reason, @judge_cost_usd)
`);
export interface JudgeRow {
  run_id: string; repo_url: string; swap: 0 | 1;
  a_spec: number; a_depth: number; a_fair: number; a_faker: number;
  b_spec: number; b_depth: number; b_fair: number; b_faker: number;
  winner: 'baseline'|'graphrag'|'tie'; reason: string; judge_cost_usd: number;
}
export const insertJudgement = (r: JudgeRow): void => { insertJudgeStmt.run(r); };

export interface Aggregate {
  pipeline: 'baseline'|'graphrag';
  n: number;
  avg_prompt_tokens: number;
  avg_completion_tokens: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
}

export function aggregate(runId?: string): Aggregate[] {
  const where = runId ? 'WHERE run_id = ?' : '';
  const rows = db.prepare(`
    SELECT pipeline, COUNT(*) AS n,
      AVG(prompt_tokens)     AS avg_prompt_tokens,
      AVG(completion_tokens) AS avg_completion_tokens,
      AVG(latency_ms)        AS avg_latency_ms,
      AVG(cost_usd)          AS avg_cost_usd
    FROM bench_runs ${where}
    GROUP BY pipeline
  `).all(...(runId ? [runId] : [])) as Aggregate[];
  return rows;
}

export function judgementSummary(runId?: string): { winner: string; n: number }[] {
  const where = runId ? 'WHERE run_id = ?' : '';
  return db.prepare(`SELECT winner, COUNT(*) AS n FROM bench_judgements ${where} GROUP BY winner`)
    .all(...(runId ? [runId] : [])) as { winner: string; n: number }[];
}
