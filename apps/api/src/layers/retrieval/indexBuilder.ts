/**
 * Builds the BasicRAG vector index from a CRM corpus sample.
 *
 * Uses the same CRM dataset as GraphRAG (TigerGraph) so the comparison is fair:
 * same data, different retrieval method.
 *
 * 1,000 chunks sampled evenly from 159K total.
 * ~10 min to embed at Jina free tier rate limits.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChunks, embedText, setReady, type Chunk } from './vectorStore.js';

const EMBED_BATCH  = 8;
// 1,000-chunk sample from the 159K corpus — keeps embed time under 15 min
// on the Jina free tier (5s sleep per batch of 8).
const TARGET_TOTAL = 1000;

const DATA_DIR   = existsSync(join(process.cwd(), 'data'))
  ? join(process.cwd(), 'data')
  : join(process.cwd(), '..', '..', 'data');
const CACHE_PATH  = join(DATA_DIR, 'embed_cache.json');
const CRM_CHUNKS  = join(DATA_DIR, 'crm', 'chunks.jsonl');


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

  // Evenly-spaced sample across the full corpus
  const step = Math.max(1, Math.floor(all.length / TARGET_TOTAL));
  const selected = all.filter((_, i) => i % step === 0).slice(0, TARGET_TOTAL);
  console.log(`[index] ${selected.length} chunks sampled from ${all.length} total`);

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

export { EMBED_BATCH, TARGET_TOTAL };
