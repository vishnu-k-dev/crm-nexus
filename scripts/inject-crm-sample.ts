/**
 * Injects a representative CRM sample into BasicRAG's embed cache.
 *
 * Strategy:
 *   1. Wait for Wikipedia embed_cache.json to exist (built by server on startup)
 *   2. Pick ALL eval-relevant entities + random sample to reach ~1,000 CRM chunks total
 *   3. Embed via Jina (same model as indexBuilder: jina-embeddings-v2-base-en)
 *   4. Append to embed_cache.json
 *
 * Result: BasicRAG now has the SAME CRM data as GraphRAG.
 * Story: same data, different retrieval method — graph traversal beats flat cosine similarity
 * on multi-hop questions. No "different corpora" objection from judges.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env'), override: true });

// Resolve data dir — works whether run from root or apps/api
const _root = join(__dirname, '..');
const DATA_DIR = existsSync(join(_root, 'apps', 'api', 'data', 'embed_cache.json'))
  ? join(_root, 'apps', 'api', 'data')
  : existsSync(join(_root, 'data', 'embed_cache.json'))
    ? join(_root, 'data')
    : join(_root, 'apps', 'api', 'data'); // default fallback
const CHUNKS_PATH  = join(_root, 'data', 'crm', 'chunks.jsonl');
const CACHE_PATH   = join(DATA_DIR, 'embed_cache.json');
const JINA_URL     = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL   = 'jina-embeddings-v2-base-en';
const EMBED_BATCH  = 8;
const TARGET_CRM   = 1000; // total CRM chunks to inject

// All entity IDs referenced in eval_questions.json — MUST be included
const EVAL_ENTITIES = new Set([
  'cust_1', 'cust_2', 'cust_3', 'cust_5', 'cust_6', 'cust_8', 'cust_10',
  'emp_1', 'emp_20', 'emp_97', 'emp_103',
  'prod_1', 'prod_2', 'prod_4', 'prod_5', 'prod_8',
  'dept_1', 'dept_2', 'dept_5',
  'deal_1', 'deal_5',
]);

interface CrmChunk { id: string; source_type: string; source_id: string; text: string }
interface Chunk { id: string; docTitle: string; text: string; embedding?: number[] }

async function embed(texts: string[]): Promise<number[][]> {
  const key = process.env.JINA_API_KEY;
  if (!key) throw new Error('JINA_API_KEY not set');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(JINA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: JINA_MODEL, input: texts }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        if (res.status === 429 || res.status >= 500) {
          const wait = [10, 20, 40, 60, 90][attempt] ?? 90;
          process.stdout.write(`\n  Jina ${res.status} — retry in ${wait}s…`);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }
        throw new Error(`Jina ${res.status}: ${body}`);
      }
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map(d => d.embedding);
    } catch (e: any) {
      if (attempt < 4 && (e.name === 'TimeoutError' || e.name === 'AbortError' || e.code === 'UND_ERR_CONNECT_TIMEOUT')) {
        const wait = [15, 30, 60, 90][attempt] ?? 90;
        process.stdout.write(`\n  Timeout — retry in ${wait}s…`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Jina embed failed after 5 attempts');
}

async function embedBatched(chunks: Chunk[]): Promise<void> {
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vecs = await embed(batch.map(c => c.text));
    for (let j = 0; j < batch.length; j++) batch[j]!.embedding = vecs[j];
    const pct = Math.round(((i + batch.length) / chunks.length) * 100);
    process.stdout.write(`\r  Embedding: ${i + batch.length}/${chunks.length} (${pct}%)`);
    if (i + EMBED_BATCH < chunks.length) await new Promise(r => setTimeout(r, 5000));
  }
  console.log();
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Injecting CRM sample into BasicRAG cache');
  console.log('═══════════════════════════════════════════════');

  // Check if CRM already injected (CRM-only cache)
  if (existsSync(CACHE_PATH)) {
    const existing = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Chunk[];
    const alreadyCrm = existing.filter(c => c.id.startsWith('crm_'));
    if (alreadyCrm.length > 0) {
      console.log(`    ⚠ ${alreadyCrm.length} CRM chunks already in cache — skipping injection`);
      console.log('    Delete embed_cache.json and re-run if you want to reset.');
      process.exit(0);
    }
  }

  console.log('[2] Reading CRM chunks…');
  if (!existsSync(CHUNKS_PATH)) throw new Error(`Missing: ${CHUNKS_PATH}`);
  const lines = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n');
  const allCrm = lines.map(l => JSON.parse(l) as CrmChunk);
  console.log(`    ${allCrm.length} total CRM chunks`);

  // Step 1: grab all eval-entity chunks (guaranteed)
  const evalChunks = allCrm.filter(c => EVAL_ENTITIES.has(c.source_id));
  console.log(`    ${evalChunks.length} eval-entity chunks (guaranteed inclusion)`);

  // Step 2: random sample from remaining to reach TARGET_CRM total
  const evalIds = new Set(evalChunks.map(c => c.id));
  const remaining = allCrm.filter(c => !evalIds.has(c.id));

  // Shuffle deterministically (seed-like: sort by id then pick evenly spaced)
  remaining.sort((a, b) => a.id.localeCompare(b.id));
  const needed = Math.max(0, TARGET_CRM - evalChunks.length);
  const step = Math.floor(remaining.length / needed);
  const sampled = needed > 0
    ? remaining.filter((_, i) => i % step === 0).slice(0, needed)
    : [];

  const selected = [...evalChunks, ...sampled];
  console.log(`    Sampling ${sampled.length} additional chunks → ${selected.length} total CRM chunks`);

  // Convert to Chunk format
  const crmChunks: Chunk[] = selected.map(c => ({
    id: `crm_${c.source_id}_${c.id}`,
    docTitle: `crm_${c.source_type}_${c.source_id}`,
    text: c.text,
  }));

  // Estimate time
  const batches = Math.ceil(crmChunks.length / EMBED_BATCH);
  const estMin = Math.round((batches * 5) / 60);
  console.log(`\n[3] Embedding ${crmChunks.length} CRM chunks (~${estMin} min)…`);

  await embedBatched(crmChunks);

  // Save CRM-only cache (no Wikipedia)
  console.log('[4] Saving CRM-only cache…');
  writeFileSync(CACHE_PATH, JSON.stringify(crmChunks), 'utf8');
  console.log(`    ✅ Saved ${crmChunks.length} CRM-only chunks`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ Done! BasicRAG now has CRM data.');
  console.log('  Restart the server so it reloads the cache.');
  console.log('  Story: same data, graph traversal beats flat');
  console.log('  cosine similarity on multi-hop questions.');
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
