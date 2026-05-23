/**
 * run-eval-batch.mjs
 *
 * Runs the next N unanswered eval questions through all 3 pipelines via the
 * live API container, saves each result immediately to crm_eval_partial.json,
 * then prints a compact stats table and a list of every GraphRAG failure.
 *
 * Usage:
 *   node scripts/run-eval-batch.mjs          # default: 10 questions
 *   node scripts/run-eval-batch.mjs 20       # custom batch size
 *   node scripts/run-eval-batch.mjs 80       # run everything remaining
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const DATA_DIR   = join(ROOT, 'data');
const PARTIAL    = join(DATA_DIR, 'crm_eval_partial.json');
const EVAL_PATH  = join(DATA_DIR, 'crm', 'eval_questions.json');
const API_BASE   = process.env.API_BASE ?? 'http://localhost:3001/api';
const BATCH_SIZE = parseInt(process.argv[2] ?? '10', 10);
const TIMEOUT_MS = 180_000; // 3 min per question (all 3 pipelines + judges)

// ── Load ──────────────────────────────────────────────────────────────────────
const allQuestions = JSON.parse(readFileSync(EVAL_PATH, 'utf8'));

let state = { n: 0, total: allQuestions.length, results: [] };
if (existsSync(PARTIAL)) {
  try { state = JSON.parse(readFileSync(PARTIAL, 'utf8')); } catch { /* start fresh */ }
}

const doneSet   = new Set(state.results.map(r => r.question));
const remaining = allQuestions.filter(q => !doneSet.has(q.question));
const batch     = remaining.slice(0, BATCH_SIZE);

console.log(`\n${'─'.repeat(72)}`);
console.log(`Eval state : ${state.results.length}/${allQuestions.length} done  |  ${remaining.length} remaining`);
console.log(`This batch : ${batch.length} questions  (batch_size=${BATCH_SIZE})`);
console.log(`${'─'.repeat(72)}\n`);

if (batch.length === 0) {
  console.log('✓ All questions complete!\n');
  printStats(state.results, allQuestions);
  process.exit(0);
}

// ── Run batch ─────────────────────────────────────────────────────────────────
const results = [...state.results];

for (let i = 0; i < batch.length; i++) {
  const q        = batch[i];
  const globalN  = state.results.length + i + 1;
  const label    = `[${globalN}/${allQuestions.length}]`;

  process.stdout.write(`${label} ${q.question.slice(0, 65).padEnd(65)}  `);

  let entry;
  try {
    const res = await fetch(`${API_BASE}/crm-eval/question`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question: q.question, referenceAnswer: q.answer }),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
    }
    const data = await res.json();

    const grVerdict  = data.graphrag?.judge?.verdict ?? 'ERR';
    const ragVerdict = data.basicRag?.judge?.verdict ?? 'ERR';
    const grTok      = data.graphrag?.promptTokens  ?? '?';
    const ragTok     = data.basicRag?.promptTokens  ?? '?';

    const grIcon  = grVerdict  === 'PASS' ? '✓' : '✗';
    const ragIcon = ragVerdict === 'PASS' ? '✓' : '✗';
    console.log(`GR:${grIcon} RAG:${ragIcon}  tok GR=${grTok} RAG=${ragTok}`);

    if (grVerdict !== 'PASS') {
      const got = (data.graphrag?.answer ?? data.graphrag?.error ?? 'NO ANSWER').slice(0, 100);
      const exp = q.answer.slice(0, 100);
      console.log(`       expected: ${exp}`);
      console.log(`       got:      ${got}`);
    }

    entry = {
      question:        q.question,
      referenceAnswer: q.answer,
      type:            q.type   ?? null,
      hops:            q.hops   ?? null,
      entities:        q.entities ?? [],
      llmOnly:         data.llmOnly,
      basicRag:        data.basicRag,
      graphrag:        { ...data.graphrag, bertScore: null }, // BERTScore added post-eval
    };

  } catch (err) {
    console.log(`ERROR: ${err.message.slice(0, 80)}`);
    entry = {
      question:        q.question,
      referenceAnswer: q.answer,
      type:            q.type   ?? null,
      hops:            q.hops   ?? null,
      entities:        q.entities ?? [],
      error:           err.message,
    };
  }

  results.push(entry);

  // Save after every question — survives crashes
  writeFileSync(PARTIAL, JSON.stringify(
    { n: results.length, total: allQuestions.length, results },
    null, 2,
  ), 'utf8');

  if (i < batch.length - 1) await new Promise(r => setTimeout(r, 800));
}

// ── Stats ─────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(72)}`);
console.log('BATCH COMPLETE — Cumulative stats');
console.log(`${'─'.repeat(72)}`);
printStats(results, allQuestions);

// ── Helpers ───────────────────────────────────────────────────────────────────
function printStats(results, allQuestions) {
  let grPass = 0, grCount = 0;
  let ragPass = 0, ragCount = 0;
  let llmPass = 0, llmCount = 0;
  let grTokSum = 0, ragTokSum = 0, matchedN = 0;
  let grLatSum = 0, ragLatSum = 0;

  for (const r of results) {
    if (r.graphrag?.judge?.verdict !== undefined) {
      grCount++;
      if (r.graphrag.judge.verdict === 'PASS') grPass++;
    }
    if (r.basicRag?.judge?.verdict !== undefined) {
      ragCount++;
      if (r.basicRag.judge.verdict === 'PASS') ragPass++;
    }
    if (r.llmOnly?.judge?.verdict !== undefined) {
      llmCount++;
      if (r.llmOnly.judge.verdict === 'PASS') llmPass++;
    }
    if (r.graphrag?.promptTokens && r.basicRag?.promptTokens) {
      grTokSum  += r.graphrag.promptTokens;
      ragTokSum += r.basicRag.promptTokens;
      grLatSum  += r.graphrag.latencyMs  ?? 0;
      ragLatSum += r.basicRag.latencyMs  ?? 0;
      matchedN++;
    }
  }

  const pct = (n, d) => d > 0 ? `${(n / d * 100).toFixed(1)}%` : 'N/A';
  const red = matchedN > 0
    ? `${((1 - grTokSum / ragTokSum) * 100).toFixed(1)}%`
    : 'N/A';
  const latRed = matchedN > 0 && ragLatSum > 0
    ? `${((1 - grLatSum / ragLatSum) * 100).toFixed(1)}%`
    : 'N/A';

  console.log(`\n  GraphRAG  accuracy : ${pct(grPass, grCount).padStart(6)}  (${grPass}/${grCount})  ← target ≥90%`);
  console.log(`  BasicRAG  accuracy : ${pct(ragPass, ragCount).padStart(6)}  (${ragPass}/${ragCount})  ← target ≤70%`);
  console.log(`  LLM-only  accuracy : ${pct(llmPass, llmCount).padStart(6)}  (${llmPass}/${llmCount})`);
  console.log(`\n  Token reduction (GR vs RAG) : ${red.padStart(6)}  ← target ≥80%`);
  console.log(`  Avg tokens  GR=${matchedN > 0 ? Math.round(grTokSum / matchedN) : '?'}  RAG=${matchedN > 0 ? Math.round(ragTokSum / matchedN) : '?'}`);
  console.log(`  Latency reduction           : ${latRed.padStart(6)}`);

  // GraphRAG failures
  const grFails = results.filter(r => r.graphrag?.judge?.verdict === 'FAIL');
  if (grFails.length > 0) {
    console.log(`\n  ── GraphRAG failures (${grFails.length}) ──`);
    grFails.forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${r.question}`);
      console.log(`      ✓ ${r.referenceAnswer?.slice(0, 90)}`);
      const got = r.graphrag?.answer ?? r.graphrag?.error ?? 'NO ANSWER';
      console.log(`      ✗ ${got.slice(0, 90)}`);
    });
  } else if (grCount > 0) {
    console.log('\n  ✓ No GraphRAG failures in completed questions!');
  }

  const nextBatch = allQuestions.length - results.length;
  if (nextBatch > 0) {
    console.log(`\n  ${nextBatch} questions remaining — run again to continue.`);
  } else {
    console.log('\n  ✓ All 80 questions complete!');
  }
  console.log('');
}
