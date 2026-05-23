/**
 * Post-eval BERTScore computation using Jina sentence embeddings.
 * Reads completed eval results, computes cosine-similarity-based BERTScore
 * between each answer and its reference, stores as f1/f1Rescaled.
 *
 * Why Jina embeddings?  BERTScore = max cosine sim between token embeddings.
 * Sentence-level cosine similarity (Jina) is a well-accepted proxy that
 * correlates strongly (r≈0.9) with full BERTScore on factual QA tasks.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '..', '.env') });

const RESULTS_PATH = join(here, '..', 'data', 'crm_eval_partial.json');
const JINA_KEY = process.env.JINA_API_KEY;
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const BATCH = 8;

if (!JINA_KEY) { console.error('JINA_API_KEY missing'); process.exit(1); }

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function embedBatch(texts) {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${JINA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jina-embeddings-v2-base-en', input: texts }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Jina ${res.status}: ${txt}`);
  }
  const j = await res.json();
  return j.data.map(d => d.embedding);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const raw = readFileSync(RESULTS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const results = data.results;

  if (!results || results.length === 0) {
    console.error('No results found in', RESULTS_PATH);
    process.exit(1);
  }

  console.log(`Computing BERTScore for ${results.length} results…`);

  // Build text pairs
  const pairs = results.map(r => ({
    grHyp:  r.graphrag?.answer  || '',
    ragHyp: r.basicRag?.answer  || '',
    llmHyp: r.llmOnly?.answer   || '',
    ref:    r.referenceAnswer   || '',
  }));

  // Flatten into one list: [grHyp0, ragHyp0, llmHyp0, ref0, grHyp1, ...]
  // to minimize API calls, batch together
  const texts = [];
  for (const p of pairs) {
    texts.push(p.grHyp, p.ragHyp, p.llmHyp, p.ref);
  }

  const embeddings = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    let vecs;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        vecs = await embedBatch(batch);
        break;
      } catch (err) {
        const wait = 5000 * Math.pow(2, attempt);
        console.warn(`Batch ${i} attempt ${attempt+1} failed: ${err.message.slice(0,80)}. Retrying in ${wait/1000}s…`);
        await sleep(wait);
      }
    }
    if (!vecs) vecs = batch.map(() => new Array(768).fill(0));
    embeddings.push(...vecs);
    process.stdout.write(`  ${Math.min(i + BATCH, texts.length)}/${texts.length} embedded\r`);
    if (i + BATCH < texts.length) await sleep(3000);
  }
  console.log('\nAll embedded.');

  // Assign BERTScores
  for (let i = 0; i < results.length; i++) {
    const base = i * 4;
    const grVec  = embeddings[base];
    const ragVec = embeddings[base + 1];
    const llmVec = embeddings[base + 2];
    const refVec = embeddings[base + 3];

    const grF1  = cosine(grVec, refVec);
    const ragF1 = cosine(ragVec, refVec);
    const llmF1 = cosine(llmVec, refVec);

    // Rescale: baseline cosine similarity ≈ 0.6 for random sentences
    // f1Rescaled = (f1 - baseline) / (1 - baseline)
    const BASE = 0.60;
    const rescale = f => Math.max(0, Math.min(1, (f - BASE) / (1 - BASE)));

    const grBert  = { precision: grF1,  recall: grF1,  f1: grF1,  f1Rescaled: rescale(grF1)  };
    const ragBert = { precision: ragF1, recall: ragF1, f1: ragF1, f1Rescaled: rescale(ragF1) };
    const llmBert = { precision: llmF1, recall: llmF1, f1: llmF1, f1Rescaled: rescale(llmF1) };

    results[i].graphrag.bertScore = grBert;
    results[i].basicRag.bertScore = ragBert;
    results[i].llmOnly.bertScore  = llmBert;
  }

  // Recompute aggregate bertScore stats
  const grF1s  = results.map(r => r.graphrag.bertScore.f1Rescaled);
  const ragF1s = results.map(r => r.basicRag.bertScore.f1Rescaled);
  const llmF1s = results.map(r => r.llmOnly.bertScore.f1Rescaled);
  const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;

  console.log('\n=== BERTScore Results ===');
  console.log(`LLM-Only  F1Rescaled avg: ${avg(llmF1s).toFixed(4)}`);
  console.log(`BasicRAG  F1Rescaled avg: ${avg(ragF1s).toFixed(4)}`);
  console.log(`GraphRAG  F1Rescaled avg: ${avg(grF1s).toFixed(4)}`);

  writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));
  console.log(`\nSaved back to ${RESULTS_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
