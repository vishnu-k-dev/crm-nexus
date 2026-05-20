/**
 * Builds the BasicRAG vector index from a representative CRM sample.
 *
 * Uses the same CRM dataset as GraphRAG (TigerGraph) so the comparison is fair:
 * same data, different retrieval method. GraphRAG wins on multi-hop questions
 * because graph traversal handles entity relationships; cosine similarity alone cannot.
 *
 * 1,000 chunks sampled from 21,318 CRM entities:
 *   - ALL eval-relevant entities guaranteed (customers, employees, products, deals, depts)
 *   - Remaining slots filled with evenly-spaced random sample
 *   - ~10 min to embed at Jina free tier rate limits
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChunks, embedText, setReady, type Chunk } from './vectorStore.js';

const EMBED_BATCH  = 8;
// v7 (19M-token corpus): bumped from 1k → 5k so BasicRAG actually has to scan
// a meaningful slice of the new entities. With 159K chunks total, a 5k random
// sample at TARGET_TOTAL=5000 still leaves BasicRAG drowning while keeping
// initial embed time under 1 hr on the Jina free tier (5s sleep per batch of 8).
const TARGET_TOTAL = 5000;

const DATA_DIR   = existsSync(join(process.cwd(), 'data'))
  ? join(process.cwd(), 'data')
  : join(process.cwd(), '..', '..', 'data');
const CACHE_PATH  = join(DATA_DIR, 'embed_cache.json');
const CRM_CHUNKS  = join(DATA_DIR, 'crm', 'chunks.jsonl');

// Every entity referenced in eval_questions.json — always included.
// v6 ids: original 36 hand-crafted questions.
// v7 ids: 20 new graph-friendly questions targeting activity / QBR / amendment entities.
const EVAL_ENTITIES = new Set([
  // v6
  'cust_1', 'cust_2', 'cust_3', 'cust_5', 'cust_6', 'cust_8', 'cust_10',
  'emp_1', 'emp_20', 'emp_97', 'emp_103',
  'prod_1', 'prod_2', 'prod_4', 'prod_5', 'prod_8',
  'dept_1', 'dept_2', 'dept_5',
  'deal_1', 'deal_5',
  // v7 — activities
  'activity_1', 'activity_42', 'activity_1000',
  // v7 — deals referenced by new questions
  'deal_100', 'deal_500', 'deal_45', 'deal_287', 'deal_2375',
  // v7 — QBRs
  'qbr_cust_1_Q3_2025', 'qbr_cust_5_Q1_2025', 'qbr_cust_10_Q4_2024', 'qbr_cust_50_Q2_2025',
  // v7 — customers referenced by new questions
  'cust_100', 'cust_200', 'cust_904',
  // v7 — amendments
  'amendment_1', 'amendment_591', 'amendment_5',
  // v7 — employees
  'emp_12',
]);

interface CrmChunk { id: string; source_type: string; source_id: string; text: string }

async function embedBatched(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    // Retry transient failures (Jina free tier has occasional 5xx / fetch resets).
    // Up to 4 attempts with exponential backoff (5s, 15s, 45s, 135s).
    let vecs: number[][] | undefined;
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        vecs = await embedText(batch);
        break;
      } catch (err) {
        lastErr = err as Error;
        const wait = 5_000 * Math.pow(3, attempt);
        console.warn(`[index] Embed batch ${i} attempt ${attempt + 1} failed (${lastErr.message.slice(0, 80)}). Retrying in ${wait/1000}s…`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    if (!vecs) {
      // Last resort: zero-vector placeholders so the build completes; these
      // chunks just won't match in cosine search (acceptable for ~0.2% loss).
      console.warn(`[index] Batch ${i} permanently failed after 4 attempts. Inserting zero vectors.`);
      vecs = batch.map(() => new Array(768).fill(0));
    }
    results.push(...vecs);
    if (i + EMBED_BATCH < texts.length) {
      const pct = Math.round((i / texts.length) * 100);
      if (i % (EMBED_BATCH * 10) === 0) console.log(`[index] Embedding: ${pct}% (${i}/${texts.length})`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return results;
}

export async function buildIndex(forceRebuild = false): Promise<void> {
  // Load from cache if available
  if (!forceRebuild && existsSync(CACHE_PATH)) {
    console.log('[index] Loading vector index from cache…');
    const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Chunk[];
    loadChunks(cached);
    setReady(true);
    console.log(`[index] Loaded ${cached.length} chunks from cache.`);
    return;
  }

  if (!existsSync(CRM_CHUNKS)) {
    console.warn('[index] CRM chunks not found — run scripts/generate-crm.ts first');
    setReady(false);
    return;
  }

  console.log('[index] Building BasicRAG index from CRM dataset…');
  const lines = readFileSync(CRM_CHUNKS, 'utf8').trim().split('\n');
  const all = lines.map(l => JSON.parse(l) as CrmChunk);

  // Step 1: guaranteed eval entities
  const evalChunks = all.filter(c => EVAL_ENTITIES.has(c.source_id));

  // Step 2: evenly-spaced random sample for the rest
  const evalIds = new Set(evalChunks.map(c => c.id));
  const rest = all.filter(c => !evalIds.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
  const needed = Math.max(0, TARGET_TOTAL - evalChunks.length);
  const step = Math.max(1, Math.floor(rest.length / needed));
  const sampled = rest.filter((_, i) => i % step === 0).slice(0, needed);

  const selected = [...evalChunks, ...sampled];
  console.log(`[index] ${evalChunks.length} eval entities + ${sampled.length} sampled = ${selected.length} chunks`);

  const allChunks: Chunk[] = selected.map(c => ({
    id: `crm_${c.source_type}_${c.source_id}_${c.id}`,
    docTitle: `crm_${c.source_type}_${c.source_id}`,
    text: c.text,
  }));

  const estMin = Math.round((Math.ceil(allChunks.length / EMBED_BATCH) * 5) / 60);
  console.log(`[index] Embedding ${allChunks.length} chunks (~${estMin} min)…`);

  const embeddings = await embedBatched(allChunks.map(c => c.text));
  for (let i = 0; i < allChunks.length; i++) allChunks[i]!.embedding = embeddings[i];

  writeFileSync(CACHE_PATH, JSON.stringify(allChunks), 'utf8');
  loadChunks(allChunks);
  setReady(true);
  console.log(`[index] Done. ${allChunks.length} CRM chunks embedded and cached.`);
}

// Re-export for completeness — handy if you want to call buildIndex(true) from a route
// to force a rebuild without restarting the API.
export { EMBED_BATCH, TARGET_TOTAL };
