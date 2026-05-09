/**
 * Ingests all Wikipedia articles into TigerGraph GraphRAG.
 *
 * Usage:
 *   npm run ingest-wiki
 *
 * Flow:
 *   1. create_graph  — creates the TigerGraph graph "MyGraph" (skip if exists)
 *   2. initialize    — installs GraphRAG schema + GSQL queries (skip if done)
 *   3. write JSONL   — writes all Wikipedia articles to data/wiki_ingest.jsonl
 *   4. docker cp     — copies the JSONL into the TigerGraph container
 *   5. gsql exec     — runs the loading job directly via `docker exec gsql` (bypasses
 *                      the GraphRAG service's broken "local" data-source path handling)
 *   6. forceupdate   — triggers ECC to chunk + embed + extract entities (async)
 *
 * Prerequisites:
 *   - Docker Desktop running
 *   - `npm run tg:up` completed (all 4 containers healthy)
 *   - `npm run download-wiki` completed (data/wikipedia/*.txt files present)
 */
import 'dotenv/config';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WIKI_DIR   = join(__dirname, '../data/wikipedia');
const JSONL_PATH = join(__dirname, '../data/wiki_ingest.jsonl');
const TG_URL     = process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000';
const GRAPH_NAME = process.env.TG_GRAPH_NAME   ?? 'MyGraph';
const TG_USER    = process.env.TG_USERNAME      ?? 'tigergraph';
const TG_PASS    = process.env.TG_PASSWORD      ?? 'tigergraph';
const AUTH       = Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');
const TG_CONTAINER = 'tg-graphrag-db';

// ── helpers ------------------------------------------------------------------

async function tgPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${TG_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${AUTH}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text }; }
}

async function tgGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${TG_URL}/${path}`, {
    headers: { 'Authorization': `Basic ${AUTH}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text }; }
}

function run(cmd: string, opts: { ignoreError?: boolean } = {}): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    if (opts.ignoreError) return (e as { stdout?: string }).stdout ?? '';
    throw new Error(`Command failed:\n  ${cmd}\n${(e as Error).message}`);
  }
}

// ── Step 1: create graph -----------------------------------------------------

async function createGraph(): Promise<void> {
  console.log(`\n[1/6] Creating graph "${GRAPH_NAME}"…`);
  try {
    const r = await tgPost(`${GRAPH_NAME}/graphrag/create_graph`, {});
    const msg = String(r.message ?? r.details ?? JSON.stringify(r)).slice(0, 120);
    if (String(r.status) === 'success') {
      console.log(`      ✓ Graph created.`);
    } else {
      console.log(`      ✓ ${msg}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (/already|exists|conflicts/i.test(msg)) {
      console.log('      ✓ Graph already exists — skipping.');
    } else {
      throw err;
    }
  }
}

// ── Step 2: initialize schema ------------------------------------------------

async function initializeSchema(): Promise<void> {
  console.log('\n[2/6] Initializing GraphRAG schema…');
  try {
    const r = await tgPost(`${GRAPH_NAME}/graphrag/initialize`, {});
    const schemaStatus = String(r.schema_creation_status ?? '').slice(0, 80);
    if (/already/i.test(schemaStatus)) {
      console.log('      ✓ Schema already initialized — skipping.');
    } else {
      console.log('      ✓ Schema initialized.');
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (/already|Schema already/i.test(msg)) {
      console.log('      ✓ Schema already initialized — skipping.');
    } else {
      throw err;
    }
  }
}

// ── Step 3: write JSONL -------------------------------------------------------

function writeJsonl(): number {
  console.log('\n[3/6] Writing Wikipedia articles to JSONL…');

  if (!existsSync(WIKI_DIR)) {
    throw new Error(`Wikipedia data not found at ${WIKI_DIR}. Run: npm run download-wiki`);
  }

  const files = readdirSync(WIKI_DIR).filter(f => f.endsWith('.txt'));
  const lines: string[] = [];

  for (const file of files) {
    const raw   = readFileSync(join(WIKI_DIR, file), 'utf8');
    const title = raw.split('\n')[0]?.replace('TITLE: ', '') ?? file.replace('.txt', '');
    const doc_id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
    // Truncate to 50k chars to keep loading job fast and avoid GSQL string limits
    const content = raw.slice(0, 50_000);
    lines.push(JSON.stringify({ doc_id, doc_type: 'characters', content }));
  }

  writeFileSync(JSONL_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`      ✓ ${lines.length} articles → data/wiki_ingest.jsonl`);
  return lines.length;
}

// ── Step 4: docker cp --------------------------------------------------------

function copyToContainer(): void {
  console.log(`\n[4/6] Copying JSONL into container "${TG_CONTAINER}"…`);
  run(`docker cp "${JSONL_PATH}" ${TG_CONTAINER}:/tmp/wiki_ingest.jsonl`);
  console.log('      ✓ /tmp/wiki_ingest.jsonl ready inside container.');
}

// ── Step 5: run loading job via docker exec gsql ----------------------------
//
// The GraphRAG service's /ingest endpoint uses the connector syntax
// `$DocumentContent:/path` which requires a registered DATA SOURCE object.
// For a plain local file we just pass the path directly to RUN LOADING JOB.
// Running `gsql` inside the TigerGraph container is the clean fix.

async function runLoadingJob(): Promise<void> {
  console.log('\n[5/6] Running GSQL loading job inside TigerGraph container…');
  console.log('      (bypasses GraphRAG service — uses gsql CLI directly)');

  // The GSQL loading job was installed by `initialize`. Run it with the local file.
  // -u / -p flags authenticate as tigergraph user inside the container.
  const gsqlCmd = [
    `docker exec ${TG_CONTAINER}`,
    `gsql`,
    `-u ${TG_USER}`,
    `-p ${TG_PASS}`,
    `"USE GRAPH ${GRAPH_NAME}`,
    `RUN LOADING JOB load_documents_content_json`,
    `USING DocumentContent=\\"/tmp/wiki_ingest.jsonl\\""`
  ].join(' ');

  // Use a shell heredoc to avoid quoting nightmares
  const script = `USE GRAPH ${GRAPH_NAME}\nRUN LOADING JOB load_documents_content_json USING DocumentContent="/tmp/wiki_ingest.jsonl"`;
  const dockerCmd = `docker exec -i ${TG_CONTAINER} /home/tigergraph/tigergraph/app/4.2.2/cmd/gsql -u ${TG_USER} -p ${TG_PASS}`;

  console.log('      Running loading job (this may take 30-120 seconds)…');

  // Pass GSQL script via stdin
  let out: string;
  try {
    out = execSync(dockerCmd, {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180_000,   // 3 min timeout
    });
  } catch (e) {
    // pyTigerGraph raises on "Running loading job in background" — that's OK
    out = ((e as { stdout?: string }).stdout ?? '') + ((e as { stderr?: string }).stderr ?? '');
    if (!/loading job/i.test(out) && !/background/i.test(out)) {
      throw new Error(`Loading job failed:\n${out.slice(0, 600)}`);
    }
  }

  if (/error/i.test(out) && !/running.*loading job/i.test(out)) {
    throw new Error(`Loading job error:\n${out.slice(0, 600)}`);
  }

  // Extract meaningful lines from GSQL output
  const meaningful = out.split('\n')
    .filter(l => l.trim() && !/^GSQL>|^>/.test(l.trim()))
    .slice(0, 8)
    .map(l => `        ${l.trim()}`)
    .join('\n');

  console.log('      ✓ Loading job submitted.');
  if (meaningful) console.log(meaningful);
}

// ── Step 6: trigger ECC -----------------------------------------------------

async function forceUpdate(): Promise<void> {
  console.log('\n[6/6] Triggering ECC (embedding + entity extraction — async)…');
  const r = await tgGet(`${GRAPH_NAME}/graphrag/forceupdate`);
  console.log(`      ✓ ECC triggered: ${r.status ?? JSON.stringify(r)}`);
}

// ── main --------------------------------------------------------------------

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  TigerGraph GraphRAG — Wikipedia Ingestion');
  console.log('══════════════════════════════════════════════════════════');

  console.log(`\nConnecting to GraphRAG service at ${TG_URL}…`);
  {
    let up = false;
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        const ping = await fetch(`${TG_URL}/health`, { headers: { 'Authorization': `Basic ${AUTH}` }, signal: AbortSignal.timeout(5000) });
        if (ping.ok || ping.status === 503) { up = true; break; }  // 503 = healthy but embedding store not ready yet — still up
      } catch { /* not ready yet */ }
      process.stdout.write(attempt === 1 ? `  Waiting for service to start` : '.');
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!up) {
      console.error(`\n\n✗ Cannot reach ${TG_URL} after 45s. Check: npm run tg:logs`);
      process.exit(1);
    }
    console.log(' ready.\n');
  }

  await createGraph();
  await initializeSchema();
  const n = writeJsonl();
  copyToContainer();
  await runLoadingJob();
  await forceUpdate();

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Done! ${n} Wikipedia articles ingested into TigerGraph.`);
  console.log('');
  console.log('  The ECC is now running in the background:');
  console.log('  chunking → Gemini embeddings → entity extraction');
  console.log('  This takes ~20-60 min for 551 articles.');
  console.log('');
  console.log('  Monitor progress:  npm run tg:logs');
  console.log('  Next step:         npm run generate-eval');
  console.log('  Then:              npm run dev');
  console.log('══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', (err as Error).message ?? err);
  process.exit(1);
});
