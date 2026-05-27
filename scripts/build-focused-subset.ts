/**
 * Build a focused subset of the v7 19M-token CRM corpus that the TigerGraph
 * GraphRAG starter kit can actually embed in our demo window.
 *
 * The full 19M corpus (~159K docs) hits Gemini's per-minute embedding rate
 * limits and would take many hours to ingest end-to-end. Generation of the
 * full corpus is unchanged — what differs here is the SLICE we hand to TG.
 *
 *   Subset target: ~5,000 docs (~3M tokens)
 *     - all 1,000 customers
 *     - all 300 employees
 *     - all 5 departments + 8 products
 *     - 200 deals (incl. every deal id referenced by an eval question)
 *     - 1,500 activities (incl. every activity id referenced by an eval question)
 *     - 1,000 QBRs (incl. every qbr id referenced by an eval question)
 *     - 500 amendments (incl. every amendment id referenced by an eval question)
 *     - 1,500 tickets (random sample for noise / drowning effect on BasicRAG)
 *
 * Output: data/crm_ingest_subset.jsonl (one doc per CRM entity, joined chunks).
 * Use this with the same load_documents_content_json job — same format.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '../data/crm');

interface Chunk { id: string; source_type: string; source_id: string; text: string }

const chunks = readFileSync(join(DATA, 'chunks.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l) as Chunk);

// Group chunks by entity
const byEntity = new Map<string, Chunk[]>();
for (const c of chunks) {
  const key = `${c.source_type}::${c.source_id}`;
  if (!byEntity.has(key)) byEntity.set(key, []);
  byEntity.get(key)!.push(c);
}

// Entities referenced by eval questions — must be included
interface EvalQ { entities: string[] }
const evalQs = JSON.parse(readFileSync(join(DATA, 'eval_questions.json'), 'utf8')) as EvalQ[];
const mustInclude = new Set<string>();
for (const q of evalQs) {
  for (const ent of q.entities) {
    if (ent === 'QBR') continue;
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
    mustInclude.add(`${prefix}::${ent}`);
  }
}
console.log(`Eval-mandatory entities: ${mustInclude.size}`);

// Sample function — keep all mustInclude, then take N random by type
function sample(type: string, target: number): Chunk[][] {
  const keys = [...byEntity.keys()].filter(k => k.startsWith(`${type}::`));
  const mandatory = keys.filter(k => mustInclude.has(k));
  const optional  = keys.filter(k => !mustInclude.has(k));
  const need = Math.max(0, target - mandatory.length);
  const step = Math.max(1, Math.floor(optional.length / Math.max(1, need)));
  const sampled = optional.filter((_, i) => i % step === 0).slice(0, need);
  return [...mandatory, ...sampled].map(k => byEntity.get(k)!);
}

// Tight subset: enough to answer all 56 eval questions + ~150 noise docs.
// Gemini free-tier embed rate (~100 RPM) means each doc-chunk = 1 embed call,
// so keep it small enough to finish ingest in well under 10 minutes.
const subset = [
  ...sample('department', 5),
  ...sample('product',    8),
  ...sample('employee',   40),
  ...sample('customer',   60),
  ...sample('deal',       40),
  ...sample('activity',   30),
  ...sample('qbr',        30),
  ...sample('amendment',  20),
  ...sample('ticket',     30),
];

console.log(`Subset entities: ${subset.length}`);

// Build the JSONL TG expects — one document per entity, joined chunks
const out: string[] = [];
let totalChars = 0;
for (const entityChunks of subset) {
  const first = entityChunks[0]!;
  const docId = `crm_${first.source_type}_${first.source_id}`;
  const content = entityChunks.map(c => c.text).join('\n\n---\n\n').slice(0, 50_000);
  totalChars += content.length;
  out.push(JSON.stringify({ doc_id: docId, doc_type: 'character', content }));
}

const outPath = join(__dirname, '../data/crm_ingest_subset.jsonl');
writeFileSync(outPath, out.join('\n') + '\n', 'utf8');
console.log(`\n✅ Wrote ${out.length} docs to ${outPath}`);
console.log(`   (~${(totalChars / 4 / 1_000_000).toFixed(2)}M tokens)`);
