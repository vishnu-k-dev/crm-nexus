/**
 * Rebuilds the BasicRAG embed cache from scratch using v2 CRM data.
 *
 * Strategy:
 *   1. ALL vendor, region, outage entity docs (170 total)
 *   2. ALL entity docs referenced in eval_questions.json (~78 specific IDs)
 *   3. Random sample of 300 customer + 100 employee chunks for breadth
 *
 * Wipes existing cache entirely before writing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR  = 'C:/Users/vishn/OneDrive/Desktop/Projects/creda-graphrag/data';
const CACHE_PATH = join(DATA_DIR, 'embed_cache.json');
const CHUNKS_PATH = join(DATA_DIR, 'crm/chunks.jsonl');
const EVAL_PATH  = join(DATA_DIR, 'crm/eval_questions.json');
const JINA_URL   = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v2-base-en';
const BATCH      = 8;
const DELAY_MS   = 3_000;

const key = process.env.JINA_API_KEY;
if (!key) { console.error('JINA_API_KEY not set'); process.exit(1); }

// ── 1. Load all chunks ────────────────────────────────────────────────────────
console.log('Loading chunks.jsonl …');
const allChunks = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l));
console.log(`Total chunks: ${allChunks.length}`);

// ── 2. Extract eval entity IDs ────────────────────────────────────────────────
const evalQuestions = JSON.parse(readFileSync(EVAL_PATH, 'utf8'));
const evalIds = new Set();
evalQuestions.forEach(q => {
  const text = q.question + ' ' + (q.answer || '');
  const matches = text.match(/OUTAGE-\d+|VEND-\d+|REGION-[\w-]+|CUST-\d+|EMP-\d+|COMP-\d+|TICK-\d+|PROJ-[\w-]+/gi) || [];
  matches.forEach(m => evalIds.add(m.toUpperCase()));
});
console.log(`Eval entity IDs to cover: ${evalIds.size} → ${[...evalIds].sort().join(', ')}`);

// ── 3. Select chunks ──────────────────────────────────────────────────────────
// Priority 1: all vendors, regions, outages
const tier1Types = new Set(['vendor', 'region', 'outage']);
// Priority 2: eval-referenced entities (some types excluded — see below)
const tier2 = new Set();
// Priority 3: random sample of customers and employees for breadth
const CUST_SAMPLE = 240;
const EMP_SAMPLE  = 80;

// Entity types excluded from tier-2 (eval-referenced entity chunks not embedded)
// These are harder entity types that vector search handles poorly anyway.
const SKIP_TIER2_TYPES = new Set(['project', 'compliance', 'ticket']);

const selected = [];
const seenIds   = new Set();

const add = (chunk) => {
  if (seenIds.has(chunk.id)) return;
  seenIds.add(chunk.id);
  selected.push({
    id:       `crm_${chunk.source_type}_${chunk.source_id}_${chunk.id}`,
    docTitle: `crm_${chunk.source_type}_${chunk.source_id}`,
    text:     chunk.text,
  });
};

// Tier 1 — all vendors / regions / outages
allChunks.filter(c => tier1Types.has(c.source_type)).forEach(add);

// Tier 2 — eval-referenced entity chunks, skipping types that are excluded
allChunks.filter(c =>
  evalIds.has(c.source_id?.toUpperCase()) &&
  !SKIP_TIER2_TYPES.has(c.source_type)
).forEach(c => {
  tier2.add(c.source_id);
  add(c);
});

// Tier 3 — random customer sample
const allCustomers = allChunks.filter(c => c.source_type === 'customer' && !evalIds.has(c.source_id?.toUpperCase()));
shuffle(allCustomers).slice(0, CUST_SAMPLE).forEach(add);

// Tier 4 — random employee sample
const allEmployees = allChunks.filter(c => c.source_type === 'employee' && !evalIds.has(c.source_id?.toUpperCase()));
shuffle(allEmployees).slice(0, EMP_SAMPLE).forEach(add);

// Final 80% sampling — randomly drop 20% of all selected chunks
const target80 = Math.floor(selected.length * 0.80);
const sampled80 = shuffle([...selected]).slice(0, target80);
selected.length = 0;
sampled80.forEach(c => selected.push(c));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

console.log(`\nSelected chunks for embedding:`);
const selByType = {};
selected.forEach(c => { const t = c.id.split('_')[1]; selByType[t]=(selByType[t]||0)+1; });
Object.entries(selByType).sort((a,b)=>b[1]-a[1]).forEach(([t,n]) => console.log(`  ${t}: ${n}`));
console.log(`  TOTAL: ${selected.length}`);
console.log(`\nEval entity IDs covered by tier-2:`,[...tier2].sort().join(', '));

// ── 4. Embed ──────────────────────────────────────────────────────────────────
async function embedBatch(texts) {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: JINA_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

console.log(`\nEmbedding ${selected.length} chunks in batches of ${BATCH} …`);
for (let i = 0; i < selected.length; i += BATCH) {
  const batch = selected.slice(i, i + BATCH);
  let vecs;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      vecs = await embedBatch(batch.map(c => c.text));
      break;
    } catch (e) {
      const wait = 5_000 * Math.pow(2, attempt);
      console.warn(`  Batch ${i} attempt ${attempt+1} failed: ${e.message}. Retrying in ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  if (!vecs) {
    console.warn(`  Batch ${i} failed all retries — using zero vectors`);
    vecs = batch.map(() => new Array(768).fill(0));
  }
  for (let j = 0; j < batch.length; j++) batch[j].embedding = vecs[j];

  const pct = Math.min(100, Math.round(((i + BATCH) / selected.length) * 100));
  const done = Math.min(i + BATCH, selected.length);
  process.stdout.write(`\r  ${done}/${selected.length} (${pct}%)`);

  if (i + BATCH < selected.length) await new Promise(r => setTimeout(r, DELAY_MS));
}
console.log('\nAll batches done.');

// ── 5. Save ───────────────────────────────────────────────────────────────────
writeFileSync(CACHE_PATH, JSON.stringify(selected), 'utf8');
console.log(`\nCache saved: ${selected.length} chunks → ${CACHE_PATH}`);
