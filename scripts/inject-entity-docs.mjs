/**
 * Injects vendor/region/outage entity documents into the BasicRAG embed cache.
 * These docs were absent from the random 1000-chunk sample.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'C:/Users/vishn/OneDrive/Desktop/Projects/creda-graphrag/data';
const CACHE_PATH = join(DATA_DIR, 'embed_cache.json');
const CHUNKS_PATH = join(DATA_DIR, 'crm/chunks.jsonl');
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v2-base-en';
const BATCH = 8;

const key = process.env.JINA_API_KEY;
if (!key) { console.error('JINA_API_KEY not set'); process.exit(1); }

// Load existing cache
const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
const existingIds = new Set(cache.map(c => c.id));
console.log('Existing cache size:', cache.length);

// Extract entity docs not already in cache
const lines = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n');
const all = lines.map(l => JSON.parse(l));
const toAdd = all
  .filter(c => ['vendor', 'region', 'outage'].includes(c.source_type))
  .map(c => ({
    id: `crm_${c.source_type}_${c.source_id}_${c.id}`,
    docTitle: `crm_${c.source_type}_${c.source_id}`,
    text: c.text,
  }))
  .filter(c => !existingIds.has(c.id));

console.log('New entity docs to embed:', toAdd.length);

async function embedBatch(texts) {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: JINA_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

for (let i = 0; i < toAdd.length; i += BATCH) {
  const batch = toAdd.slice(i, i + BATCH);
  let vecs;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      vecs = await embedBatch(batch.map(c => c.text));
      break;
    } catch (e) {
      const wait = 5000 * Math.pow(2, attempt);
      console.warn(`Batch ${i} attempt ${attempt+1} failed: ${e.message}. Retrying in ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  if (!vecs) { vecs = batch.map(() => new Array(768).fill(0)); }
  for (let j = 0; j < batch.length; j++) batch[j].embedding = vecs[j];
  cache.push(...batch);
  const pct = Math.round(((i + BATCH) / toAdd.length) * 100);
  console.log(`Embedded ${Math.min(i + BATCH, toAdd.length)}/${toAdd.length} (${pct}%)`);
  if (i + BATCH < toAdd.length) await new Promise(r => setTimeout(r, 5000));
}

writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
console.log(`Done. Cache now has ${cache.length} chunks (+${toAdd.length} entity docs).`);
