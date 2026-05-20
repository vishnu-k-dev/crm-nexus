/**
 * Re-submit just the eval-question entity docs so ECC processes them ahead
 * of the bulk corpus. Useful when the full 19M-token corpus would take hours
 * to embed, but the 56 eval questions only touch ~40 specific entities.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env'), override: true });

const TG_APP_URL = process.env.TG_GRAPHRAG_URL ?? 'http://localhost:8000';
const GRAPH_NAME = process.env.TG_GRAPH_NAME  ?? 'MyGraph';
const TG_USER    = process.env.TG_USERNAME     ?? 'tigergraph';
const TG_PASS    = process.env.TG_PASSWORD     ?? 'tigergraph';
const AUTH       = 'Basic ' + Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');

interface EvalQuestion { question: string; answer: string; entities: string[] }

const evalQs = JSON.parse(readFileSync(join(__dirname, '../data/crm/eval_questions.json'), 'utf8')) as EvalQuestion[];

const docIds = new Set<string>();
for (const q of evalQs) {
  for (const ent of q.entities) {
    if (ent === 'QBR') continue;  // type-level, not an entity id
    // Map entity id to the doc_id format used during ingest: crm_<sourcetype>_<id>
    const prefix =
      ent.startsWith('cust_') ? 'customer'
      : ent.startsWith('emp_') ? 'employee'
      : ent.startsWith('prod_') ? 'product'
      : ent.startsWith('dept_') ? 'department'
      : ent.startsWith('deal_') ? 'deal'
      : ent.startsWith('activity_') ? 'activity'
      : ent.startsWith('qbr_') ? 'qbr'
      : ent.startsWith('amendment_') ? 'amendment'
      : ent.startsWith('ticket_') ? 'ticket'
      : null;
    if (!prefix) continue;
    docIds.add(`crm_${prefix}_${ent}`);
  }
}

console.log(`Eval-relevant docs: ${docIds.size}`);
console.log(`Submitting them to forceupdate to prioritize ECC processing…`);

const qs = [...docIds].map(id => `doc_ids=${encodeURIComponent(id)}`).join('&');
const url = `${TG_APP_URL}/${GRAPH_NAME}/graphrag/forceupdate?${qs}`;

const res = await fetch(url, { method: 'GET', headers: { Authorization: AUTH } });
const text = await res.text();
console.log(`  → ${res.status}: ${text.slice(0, 300)}`);
console.log('\nDone. ECC should pick these up next.');
