/**
 * Installs the custom GSQL multi-hop retrieval query into TigerGraph.
 * Run once: npx tsx scripts/install-gsql-query.ts
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: resolve(fileURLToPath(import.meta.url), '../../.env'), override: true });

const TG_HOST  = 'http://127.0.0.1:14240';
const GRAPH    = process.env.TG_GRAPH_NAME ?? 'MyGraph';
const TG_USER  = process.env.TG_USERNAME   ?? 'tigergraph';
const TG_PASS  = process.env.TG_PASSWORD   ?? 'tigergraph';
const AUTH     = Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');

// Pure SYNTAX v3 query — no POST-ACCUM (V1 only), no local accumulators.
// vectorSearch() requires v3; ACCUM is valid in v3.
// Final attempt: SYNTAX v2 with vectorSearch + standard SELECT FROM ACCUM
// v2 SELECT traversal is valid; vectorSearch may work without explicit v3 declaration
const QUERY = `CREATE OR REPLACE QUERY graphRAGSearch(LIST<FLOAT> query_embedding, INT top_k = 5) FOR GRAPH ${GRAPH} SYNTAX v2 {
  MapAccum<VERTEX, FLOAT> @@dist_map;
  ListAccum<STRING> @@texts;
  seeds = vectorSearch({DocumentChunk.embedding}, query_embedding, top_k, {distance_map: @@dist_map});
  c1 = SELECT c FROM seeds:s -(HAS_CONTENT:e)-> Content:c
       ACCUM @@texts += c.text;
  after = SELECT ch FROM seeds:s -(IS_AFTER:e)-> DocumentChunk:ch;
  c2 = SELECT c FROM after:s -(HAS_CONTENT:e)-> Content:c
       ACCUM @@texts += c.text;
  PRINT @@texts;
}`;

async function gsql(statement: string, desc: string): Promise<string> {
  console.log(`\n[gsql] ${desc}...`);
  const res = await fetch(`${TG_HOST}/gsql/v1/statements`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'Authorization': `Basic ${AUTH}` },
    body: statement,
  });
  const text = await res.text();
  console.log(`[gsql] Status: ${res.status}`);
  console.log(`[gsql] Response: ${text.slice(0, 600)}`);
  if (!res.ok) throw new Error(`GSQL failed (${res.status}): ${text.slice(0, 200)}`);
  if (/no viable alternative|mismatched input|syntax error|DRAFT|failed/i.test(text)) {
    throw new Error(`GSQL semantic error:\n${text.slice(0, 400)}`);
  }
  return text;
}

async function main() {
  console.log(`Installing graphRAGSearch on ${GRAPH}...`);
  await gsql(`USE GRAPH ${GRAPH}`, 'Switch to graph');
  await gsql(`USE GRAPH ${GRAPH}\n${QUERY}`, 'Create query');
  await gsql(`USE GRAPH ${GRAPH}\nINSTALL QUERY graphRAGSearch`, 'Install query (compiling ~30s)');
  console.log('\n✅ graphRAGSearch installed successfully.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
