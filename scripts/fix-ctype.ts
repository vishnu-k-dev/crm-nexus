/**
 * Fixes ctype on all CRM Content vertices from "characters" → "character"
 * and re-triggers forceupdate so ECC can embed them.
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
const BATCH_SIZE = 200;
const FU_BATCH   = 500;

interface CrmChunk { source_type: string; source_id: string }

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

async function main() {
  const lines = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n');
  const docIds = [...new Set(lines.map(l => {
    const c = JSON.parse(l) as CrmChunk;
    return `crm_${c.source_type}_${c.source_id}`;
  }))];
  console.log(`Fixing ctype for ${docIds.length} CRM Content vertices…`);

  let fixed = 0;
  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const batch = docIds.slice(i, i + BATCH_SIZE);
    const vertices: Record<string, Record<string, unknown>> = { Content: {} };
    for (const docId of batch) {
      vertices['Content']![docId] = { ctype: { value: 'character' } };
    }
    try {
      await restPost(`${TG_RESTPP}/graph/${GRAPH_NAME}`, { vertices });
      fixed += batch.length;
    } catch (e) {
      console.warn(`Batch ${i} failed: ${(e as Error).message.slice(0, 80)}`);
    }
    if (i % (BATCH_SIZE * 10) === 0) process.stdout.write(`\r  ${fixed}/${docIds.length} fixed…`);
  }
  console.log(`\n✅ ${fixed} Content vertices updated to ctype="character"`);

  // Re-trigger forceupdate
  console.log(`Triggering forceupdate for ${docIds.length} docs…`);
  let submitted = 0;
  for (let i = 0; i < docIds.length; i += FU_BATCH) {
    const batch = docIds.slice(i, i + FU_BATCH);
    const qs = batch.map(id => `doc_ids=${encodeURIComponent(id)}`).join('&');
    try {
      await restGet(`${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate?${qs}`);
      submitted += batch.length;
    } catch {
      try {
        await restPost(`${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate`, { doc_ids: batch });
        submitted += batch.length;
      } catch (e2) {
        console.warn(`forceupdate ${i}: ${(e2 as Error).message.slice(0, 60)}`);
      }
    }
    if (i % (FU_BATCH * 5) === 0) process.stdout.write(`\r  forceupdate: ${submitted}/${docIds.length}…`);
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\n✅ ${submitted} docs re-submitted for embedding`);
  console.log('ECC is now chunking + embedding — check epoch_processed on CRM docs to monitor.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
