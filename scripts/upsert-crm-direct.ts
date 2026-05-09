/**
 * Directly upserts CRM chunks into TigerGraph via RESTPP (bypasses GSQL loading job).
 * After upsert, triggers forceupdate (GET) to start embedding.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env'), override: true });

const CHUNKS_PATH  = join(__dirname, '../data/crm/chunks.jsonl');
const TG_RESTPP   = process.env.TG_RESTPP_URL ?? 'http://localhost:14240/restpp';
const TG_APP_URL  = process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000';
const GRAPH_NAME  = process.env.TG_GRAPH_NAME   ?? 'MyGraph';
const TG_USER     = process.env.TG_USERNAME      ?? 'tigergraph';
const TG_PASS     = process.env.TG_PASSWORD      ?? 'tigergraph';
const AUTH        = 'Basic ' + Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');
const BATCH_SIZE  = 200;   // vertices per upsert request
const FU_BATCH    = 500;   // doc_ids per forceupdate request

interface CrmChunk { id: string; source_type: string; source_id: string; text: string }

async function restPost(url: string, body: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function restGet(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  const text = await r.text();
  if (!r.ok) throw new Error(`GET ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CRM Direct RESTPP Upsert');
  console.log('═══════════════════════════════════════════');

  if (!existsSync(CHUNKS_PATH)) throw new Error(`Missing: ${CHUNKS_PATH}`);

  const lines = readFileSync(CHUNKS_PATH, 'utf8').trim().split('\n');
  console.log(`[1] Reading ${lines.length} CRM chunks…`);

  // Group by source entity → one Document+Content per entity
  const docMap = new Map<string, string[]>();
  for (const line of lines) {
    const c = JSON.parse(line) as CrmChunk;
    const docId = `crm_${c.source_type}_${c.source_id}`;
    if (!docMap.has(docId)) docMap.set(docId, []);
    docMap.get(docId)!.push(c.text);
  }
  const docs = [...docMap.entries()].map(([docId, texts]) => ({
    docId,
    content: texts.join('\n\n---\n\n').slice(0, 50_000),
  }));
  console.log(`    → ${docs.length} unique CRM entities`);

  const epoch = Math.floor(Date.now() / 1000);
  let accepted = 0;

  console.log(`[2] Upserting in batches of ${BATCH_SIZE}…`);
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const vertices: Record<string, Record<string, unknown>> = { Document: {}, Content: {} };
    const edges: Record<string, Record<string, unknown>> = { Document: {} };

    for (const { docId, content } of batch) {
      vertices['Document']![docId] = {
        id: { value: docId },
        epoch_added: { value: epoch },
        epoch_processing: { value: 0 },
        epoch_processed: { value: 0 },
      };
      vertices['Content']![docId] = {
        id: { value: docId },
        ctype: { value: 'characters' },
        text: { value: content },
        epoch_added: { value: epoch },
      };
      edges['Document']![docId] = {
        HAS_CONTENT: { Content: { [docId]: {} } },
      };
    }

    try {
      const r = await restPost(`${TG_RESTPP}/graph/${GRAPH_NAME}`, { vertices, edges }) as { results?: { accepted_vertices?: number }[] };
      accepted += r?.results?.[0]?.accepted_vertices ?? 0;
    } catch (e) {
      console.warn(`  ⚠ Batch ${i}-${i + BATCH_SIZE}: ${(e as Error).message.slice(0, 80)}`);
    }

    if ((i / BATCH_SIZE) % 10 === 0) {
      process.stdout.write(`\r    ${i + batch.length}/${docs.length} entities upserted…`);
    }
  }
  console.log(`\n    ✓ ${accepted} vertices accepted`);

  // Trigger forceupdate via GET (the correct method)
  const docIds = docs.map(d => d.docId);
  console.log(`[3] Triggering forceupdate for ${docIds.length} documents (GET)…`);
  let submitted = 0;
  for (let i = 0; i < docIds.length; i += FU_BATCH) {
    const batch = docIds.slice(i, i + FU_BATCH);
    const qs = batch.map(id => `doc_ids=${encodeURIComponent(id)}`).join('&');
    try {
      await restGet(`${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate?${qs}`);
      submitted += batch.length;
    } catch (e) {
      // try POST as fallback
      try {
        await restPost(`${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate`, { doc_ids: batch });
        submitted += batch.length;
      } catch (e2) {
        console.warn(`  ⚠ forceupdate batch ${i}: ${(e2 as Error).message.slice(0, 80)}`);
      }
    }
    if (i % (FU_BATCH * 5) === 0) process.stdout.write(`\r    forceupdate: ${submitted}/${docIds.length}…`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`\n    ✓ ${submitted} documents submitted for embedding`);

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ Done! TigerGraph is now embedding CRM data.');
  console.log('  Check: GET /MyGraph/graphrag/status');
  console.log('═══════════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
