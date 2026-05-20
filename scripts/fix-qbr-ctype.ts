/**
 * Fix the QBR Content vertices that fix-ctype.ts missed because their doc_ids
 * contain uppercase quarter labels (Q1/Q2/Q3/Q4) — the loading job lowercases
 * the id when creating the vertex, but fix-ctype built upper-case ids and so
 * the upsert silently created new (non-existent-row) targets instead of
 * updating the lowercase vertices that already exist.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env'), override: true });

const CHUNKS_PATH = join(__dirname, '../data/crm/chunks.jsonl');
const TG_RESTPP  = process.env.TG_RESTPP_URL ?? 'http://localhost:14240/restpp';
const TG_APP_URL = process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000';
const GRAPH_NAME = process.env.TG_GRAPH_NAME  ?? 'MyGraph';
const TG_USER    = process.env.TG_USERNAME     ?? 'tigergraph';
const TG_PASS    = process.env.TG_PASSWORD     ?? 'tigergraph';
const AUTH       = 'Basic ' + Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');
const BATCH      = 500;

async function restPost(url: string, body: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function restGet(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

interface CrmChunk { source_type: string; source_id: string }

async function main() {
  const lines = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n');
  const docIds = [...new Set(lines.map(l => {
    const c = JSON.parse(l) as CrmChunk;
    // lowercase to match how the loading job stored these Content vertices
    return `crm_${c.source_type}_${c.source_id}`.toLowerCase();
  }))];
  console.log(`Re-issuing ctype="character" for ${docIds.length} (lowercased) docs…`);

  let fixed = 0;
  for (let i = 0; i < docIds.length; i += BATCH) {
    const batch = docIds.slice(i, i + BATCH);
    const vertices: Record<string, Record<string, unknown>> = { Content: {} };
    for (const id of batch) vertices['Content']![id] = { ctype: { value: 'character' } };
    try {
      await restPost(`${TG_RESTPP}/graph/${GRAPH_NAME}`, { vertices });
      fixed += batch.length;
    } catch (e) {
      console.warn(`Batch ${i} failed: ${(e as Error).message.slice(0, 80)}`);
    }
    if (i % (BATCH * 10) === 0) process.stdout.write(`\r  ${fixed}/${docIds.length} fixed…`);
  }
  console.log(`\n✅ ${fixed} Content vertices set to ctype="character"`);

  // Sanity-check: count any remaining "characters" (plural)
  const remaining = await restGet(`${TG_RESTPP}/graph/${GRAPH_NAME}/vertices/Content?filter=ctype=%22characters%22&limit=1`);
  const remCount = ((remaining as { results: unknown[] }).results ?? []).length;
  if (remCount > 0) {
    console.warn('⚠ Some "characters" vertices remain — check id casing.');
  } else {
    console.log('✓ No Content vertices left with ctype="characters".');
  }

  // Re-trigger ECC
  console.log('Triggering forceupdate to re-process…');
  const fu = await restGet(`${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate`);
  console.log(`  → ${JSON.stringify(fu)}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
