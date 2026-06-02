/**
 * Builds the BasicRAG flat-vector index from the CRM corpus.
 * Includes documents for the entities referenced in the evaluation set plus an
 * even corpus sample, so the flat-RAG baseline has fair access to the relevant
 * data and the comparison reflects retrieval method rather than data coverage.
 *
 * Writes data/embed_cache.json in the vectorStore Chunk[] format; restart the
 * API to load it (buildIndex reads from cache).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '..', '.env') });

const DATA = join(here, '..', 'data');
const CHUNKS = join(DATA, 'crm', 'chunks.jsonl');
const EVAL = join(DATA, 'crm', 'eval_questions.json');
const CACHE = join(DATA, 'embed_cache.json');
const JINA_KEY = process.env.JINA_API_KEY;
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const TARGET = 2000;
const PER_ENTITY_CAP = 6;
const BATCH = 8;

if (!JINA_KEY) { console.error('JINA_API_KEY missing'); process.exit(1); }

// 1. Extract entity IDs from the 90 questions
const qs = JSON.parse(readFileSync(EVAL, 'utf8'));
const idSet = new Set();
const patterns = [/OUTAGE-\d+/g, /CUST-\d+/g, /VEND-\d+/g, /EMP-\d+/g, /TICK-\d+/g, /COMP-\d+/g, /PROJ-[A-Z0-9-]+/g, /REGION-[A-Z-]+/g];
for (const q of qs) for (const re of patterns) { const m = q.question.toUpperCase().match(re); if (m) m.forEach(x => idSet.add(x)); }
console.log(`Eval entities to guarantee: ${idSet.size}`);

// 2. Load corpus, bucket by source_id
const all = readFileSync(CHUNKS, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const bySrc = new Map();
for (const c of all) { const k = (c.source_id || '').toUpperCase(); if (!bySrc.has(k)) bySrc.set(k, []); bySrc.get(k).push(c); }

// 3. Guarantee eval-entity chunks (cap per entity)
const picked = new Map(); // id -> chunk
let entityHits = 0;
for (const id of idSet) {
  const cs = bySrc.get(id) || [];
  for (const c of cs.slice(0, PER_ENTITY_CAP)) { picked.set(c.id, c); entityHits++; }
}
console.log(`Guaranteed entity chunks: ${entityHits} (covering ${[...idSet].filter(id => bySrc.has(id)).length}/${idSet.size} entities found in corpus)`);

// 4. Fill to TARGET with an even sample of the rest
const remaining = all.filter(c => !picked.has(c.id));
const need = Math.max(0, TARGET - picked.size);
const step = Math.max(1, Math.floor(remaining.length / need));
for (let i = 0; i < remaining.length && picked.size < TARGET; i += step) picked.set(remaining[i].id, remaining[i]);
const selected = [...picked.values()];
console.log(`Total selected: ${selected.length} (${entityHits} entity + ${selected.length - entityHits} sample)`);

// 5. Embed via Jina
async function embedBatch(texts) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(JINA_URL, { method:'POST', headers:{'Authorization':`Bearer ${JINA_KEY}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'jina-embeddings-v2-base-en', input: texts }) });
      if (!r.ok) throw new Error(`Jina ${r.status}`);
      const j = await r.json(); return j.data.map(d => d.embedding);
    } catch (e) { const w = 5000*Math.pow(3,a); console.warn(`batch retry in ${w/1000}s (${e.message})`); await new Promise(r=>setTimeout(r,w)); }
  }
  return texts.map(() => new Array(768).fill(0));
}

const chunks = selected.map(c => ({ id: `crm_${c.source_type}_${c.source_id}_${c.id}`, docTitle: `crm_${c.source_type}_${c.source_id}`, text: c.text }));
console.log(`Embedding ${chunks.length} chunks (~${Math.round(Math.ceil(chunks.length/BATCH)*5/60)} min)…`);
const emb = [];
for (let i = 0; i < chunks.length; i += BATCH) {
  emb.push(...await embedBatch(chunks.slice(i, i+BATCH).map(c => c.text)));
  if (i % (BATCH*10) === 0) process.stdout.write(`  ${i}/${chunks.length}\r`);
  if (i + BATCH < chunks.length) await new Promise(r=>setTimeout(r,5000));
}
for (let i = 0; i < chunks.length; i++) chunks[i].embedding = emb[i];
writeFileSync(CACHE, JSON.stringify(chunks), 'utf8');
console.log(`\nDone. Wrote ${chunks.length} chunks to embed_cache.json. Restart API to load.`);
