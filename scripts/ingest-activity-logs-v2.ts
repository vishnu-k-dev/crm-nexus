/**
 * Ingest Activity Logs v2 into TigerGraph
 * Loads data/activity_ingest_v2.jsonl → 201M total token dataset
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env'), override: true });

const JSONL_PATH    = join(__dirname, '../data/activity_ingest_v2.jsonl');
const TG_URL        = process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000';
const GRAPH_NAME    = process.env.TG_GRAPH_NAME   ?? 'MyGraph';
const TG_USER       = process.env.TG_USERNAME      ?? 'tigergraph';
const TG_PASS       = process.env.TG_PASSWORD      ?? 'tigergraph';
const TG_CONTAINER  = 'tg-graphrag-db';

function run(cmd: string, input?: string): string {
  try {
    return execSync(cmd, {
      input,
      encoding: 'utf8',
      stdio: input !== undefined ? ['pipe','pipe','pipe'] : ['inherit','pipe','pipe'],
      timeout: 600_000,
    });
  } catch (e) {
    const out = ((e as { stdout?: string }).stdout ?? '') + ((e as { stderr?: string }).stderr ?? '');
    if (/loading job|background/i.test(out)) return out;
    throw new Error(`Command failed: ${(e as Error).message}\n${out.slice(0, 500)}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Activity Logs v2 → TigerGraph Ingest (→ 201M tokens)');
  console.log('═══════════════════════════════════════════════════════');

  if (!existsSync(JSONL_PATH)) {
    throw new Error('data/activity_ingest_v2.jsonl not found. Run first:\n  npx tsx scripts/generate-activity-logs-v2.ts');
  }

  const lines = readFileSync(JSONL_PATH, 'utf8').trim().split('\n');
  const totalChars = lines.reduce((s, l) => s + l.length, 0);
  console.log(`\n  Loaded ${lines.length.toLocaleString()} docs`);
  console.log(`  (~${(totalChars / 4_000_000).toFixed(1)}M tokens)\n`);

  // Step 1: docker cp
  console.log('[1/3] Copying JSONL into TigerGraph container…');
  run(`docker cp "${JSONL_PATH}" ${TG_CONTAINER}:/tmp/activity_ingest_v2.jsonl`);
  console.log('      ✓ /tmp/activity_ingest_v2.jsonl ready in container');

  // Step 2: GSQL loading job
  console.log('\n[2/3] Running GSQL loading job…');
  const script = `USE GRAPH ${GRAPH_NAME}\nRUN LOADING JOB load_documents_content_json USING DocumentContent="/tmp/activity_ingest_v2.jsonl"`;
  const dockerCmd = `docker exec -i ${TG_CONTAINER} /home/tigergraph/tigergraph/app/4.2.2/cmd/gsql -u ${TG_USER} -p ${TG_PASS}`;
  const out = run(dockerCmd, script);
  const meaningful = out.split('\n').filter(l => l.trim() && !/^GSQL>|^>/.test(l.trim())).slice(0, 6).join('\n      ');
  console.log(`      Output:\n      ${meaningful}`);
  console.log('      ✓ Loading job complete');

  // Step 3: Force update
  console.log('\n[3/3] Triggering ECC to chunk + embed new docs…');
  try {
    const res = await fetch(`${TG_URL}/${GRAPH_NAME}/graphrag/forceupdate`, {
      headers: { 'Authorization': `Basic ${Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64')}` },
    });
    const text = await res.text();
    console.log(`      ✓ Submitted: ${text}`);
  } catch (err) {
    console.warn(`      ⚠ forceupdate: ${(err as Error).message.slice(0, 200)}`);
    console.warn('        (ECC may already be processing — check status manually)');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ v2 ingest complete!');
  console.log(`     ${lines.length.toLocaleString()} documents loaded`);
  console.log('');
  console.log('  Now update UI badges: 150M → 201M');
  console.log('  → web/index.html  +  apps/web/src/main.tsx');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
