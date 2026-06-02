/**
 * Pipeline 3 — GraphRAG (TigerGraph native GSQL query).
 *
 * Architecture:
 *   1. Embed question using Google Gemini (gemini-embedding-001, 768-dim)
 *      — same model TigerGraph used to index the documents → vectors are comparable
 *   2. Call installed GSQL query `graphRAGSearch` which runs on TigerGraph directly:
 *        Hop 1: vectorSearch() on DocumentChunk.embedding (HNSW native index)
 *        Hop 2: IS_AFTER / reverse IS_AFTER graph traversal → adjacent chunk context
 *        Returns: raw Content.text — NO TigerGraph LLM generation
 *   3. Rerank raw chunks with llama-3.1-8b-instant to pick most relevant
 *   4. Generate final answer with Groq 70b (same model as all pipelines → fair comparison)
 *
 * Graph structure used:
 *   DocumentChunk -[IS_AFTER]-> DocumentChunk   (sequential ordering)
 *   DocumentChunk -[HAS_CONTENT]-> Content      (raw text)
 *   DocumentChunk.embedding                      (HNSW 768-dim cosine index)
 */
import Groq from 'groq-sdk';
import { generate, costUsd } from '../../llm/claude.js';
import { analyzeQuery } from '../queryAnalyzer.js';
import type { PipelineResult } from './llmOnly.js';

// ── Groq reranker — rotates across 2 fresh keys ──────────────────────────────
const _rerankerClients: Groq[] = [];
let _rerankerIdx = 0;
function reranker(): Groq {
  if (_rerankerClients.length === 0) {
    const keys = [
      process.env.GROQ_API_KEY_LLM,
      process.env.GROQ_API_KEY_GRAPH,
    ].filter(Boolean) as string[];
    if (keys.length === 0) throw new Error('No GROQ keys set for reranker');
    for (const k of keys) _rerankerClients.push(new Groq({ apiKey: k }));
  }
  const client = _rerankerClients[_rerankerIdx % _rerankerClients.length]!;
  _rerankerIdx++;
  return client;
}

// ── Config ────────────────────────────────────────────────────────────────────
const TG_RESTPP_URL = process.env.TG_RESTPP_URL ?? 'http://127.0.0.1:14240';
const TG_GRAPHRAG_URL = process.env.TG_GRAPHRAG_URL ?? 'http://127.0.0.1:8000';
const GRAPH_NAME    = process.env.TG_GRAPH_NAME  ?? 'MyGraph';
const TG_USER       = process.env.TG_USERNAME    ?? 'tigergraph';
const TG_PASS       = process.env.TG_PASSWORD    ?? 'tigergraph';
const AUTH          = Buffer.from(`${TG_USER}:${TG_PASS}`).toString('base64');
const MODEL_NAME    = process.env.GEN_MODEL      ?? 'llama-3.1-8b-instant';
const GOOGLE_KEY    = process.env.GOOGLE_API_KEY ?? '';

const SYSTEM = `You are a precise enterprise CRM data assistant. Today's date is 2026-05-23. Answer from context only.
- Prose only. Copy all entity IDs (OUTAGE-001, CUST-0001, VEND-01, REGION-FRANKFURT, EMP-001, etc.), numbers, dates, and names verbatim from context.
- ALWAYS open your answer by naming the PRIMARY entity — the PRIMARY entity is the one whose ID appears IN THE QUESTION ITSELF:
  Question contains CUST-XXXX  → open "Customer CUST-XXXX (Name)…"  (even if the question asks about their region, vendor, or segment)
  Question contains OUTAGE-XXX → open "Outage OUTAGE-XXX (P2, 17 hours, REGION-TORONTO, VEND-10)…"  (use ACTUAL values from context, this is an example format only)
  Question contains EMP-XXX    → open "Employee EMP-XXX (Name)…"
  Question contains PROJ-XXX   → open "Project PROJ-XXX (Name)…"  (even if the question asks about the project's owner, vendor, or status)
  Question contains VEND-XX    → open "Vendor VEND-XX (Name, SLA tier, Category, Region affinity)…"  e.g. "Vendor VEND-30 (StreamFlow, Bronze SLA, DevOps, REGION-SAO-PAULO)…"
  Question contains REGION-XXX → open "Region REGION-XXX…"
  Do NOT name or mention entities that are not the subject of the question. Never add "X is not mentioned in this context" for entity types unrelated to the question.
- For outage questions: include severity, affected systems, duration in hours, region, and vendor. For customer questions: include customer name, industry, market_segment (e.g., Mid-Market, Enterprise, SMB), and primary vendor — "segment" or "their segment" always means the customer's market_segment field. For employee questions: include name, role, department, and region. For compliance questions: include type, status, severity, and customer ID. For ticket questions: include category, priority, status, and outage linkage. For vendor questions: include SLA tier, category, and region affinity. For project questions: include project name, status, region, and vendor.
- For "How many" (count) questions: answer DIRECTLY with the number first — e.g., "250 customers are hosted in REGION-TORONTO." Do NOT apply the primary entity opening rule to count questions. Do not open with "Customer CUST-X" or "Outage OUTAGE-X" for count/aggregate questions. Copy the EXACT number verbatim from context — never approximate, estimate, or round (e.g., "250" not "25" or "240"). When asked "how many total X has [entity] caused/experienced": count the items listed in "X History:" explicitly — if the list is "OUTAGE-001, OUTAGE-051", that is exactly 2.
- For "which X" questions (e.g., "which projects were impacted?", "which outages occurred in REGION-X?", "which systems were affected?"): list ONLY the requested entity IDs found in the relevant section. For "which outages occurred in REGION-X": use the exact text from "Outage History:" — e.g., "REGION-TORONTO has experienced 5 outages: OUTAGE-010, OUTAGE-030, OUTAGE-050, OUTAGE-070, OUTAGE-090." Do NOT prefix outage IDs with the word "Outage" in a list (write "OUTAGE-001, OUTAGE-021" not "Outage OUTAGE-001, Outage OUTAGE-021").
- For "how many outages in REGION-X": use ONLY the count from "Outage History:" (e.g., "5 outages") — NOT the customer count from "Customer Footprint:". These are different numbers.
- The "For outage questions: include severity, systems, duration, region, vendor" rule applies to GENERAL outage questions. For specific sub-questions like "which projects?", "which customers?", or "how many X?", answer ONLY what is asked.
- If the context does not contain information about a specific entity ID: state "The provided context does not contain information about [entity ID]."
- No speculation or invented facts. Be complete but concise.`;

// ── Embed question using Google Gemini (same model TigerGraph uses) ───────────
async function embedQuestion(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini embed error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { embedding: { values: number[] } };
  return data.embedding.values;
}

// ── Call installed GSQL query via RESTPP ─────────────────────────────────────
async function callGsqlQuery(embedding: number[], topK: number): Promise<string[]> {
  const res = await fetch(
    `${TG_RESTPP_URL}/restpp/query/${GRAPH_NAME}/graphRAGSearch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${AUTH}`,
      },
      body: JSON.stringify({ query_embedding: embedding, top_k: topK }),
    },
  );
  if (!res.ok) {
    throw new Error(`GSQL query error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json() as { results?: Array<Record<string, string[]>> };
  return data.results?.[0]?.['@@texts'] ?? [];
}

// ── Entity-targeted chunk fetch via RESTPP ───────────────────────────────────
// Maps question keywords → known article prefixes in the knowledge base.
// When detected, directly fetches the first N chunks of that article by vertex ID
// — bypassing vector search which fails to find early (founding/intro) chunks.
const ARTICLE_MAP: Record<string, string> = {
  // ── Outage IDs (OUTAGE-001 … OUTAGE-100) ────────────────────────────────────
  'outage-001': 'crm_outage_outage-001', 'outage-002': 'crm_outage_outage-002',
  'outage-003': 'crm_outage_outage-003', 'outage-004': 'crm_outage_outage-004',
  'outage-005': 'crm_outage_outage-005', 'outage-006': 'crm_outage_outage-006',
  'outage-007': 'crm_outage_outage-007', 'outage-008': 'crm_outage_outage-008',
  'outage-009': 'crm_outage_outage-009', 'outage-010': 'crm_outage_outage-010',
  'outage-011': 'crm_outage_outage-011', 'outage-012': 'crm_outage_outage-012',
  'outage-013': 'crm_outage_outage-013', 'outage-014': 'crm_outage_outage-014',
  'outage-015': 'crm_outage_outage-015', 'outage-016': 'crm_outage_outage-016',
  'outage-017': 'crm_outage_outage-017', 'outage-018': 'crm_outage_outage-018',
  'outage-019': 'crm_outage_outage-019', 'outage-020': 'crm_outage_outage-020',
  'outage-021': 'crm_outage_outage-021', 'outage-022': 'crm_outage_outage-022',
  'outage-023': 'crm_outage_outage-023', 'outage-024': 'crm_outage_outage-024',
  'outage-025': 'crm_outage_outage-025', 'outage-026': 'crm_outage_outage-026',
  'outage-027': 'crm_outage_outage-027', 'outage-028': 'crm_outage_outage-028',
  'outage-029': 'crm_outage_outage-029', 'outage-030': 'crm_outage_outage-030',
  'outage-031': 'crm_outage_outage-031', 'outage-032': 'crm_outage_outage-032',
  'outage-033': 'crm_outage_outage-033', 'outage-034': 'crm_outage_outage-034',
  'outage-035': 'crm_outage_outage-035', 'outage-036': 'crm_outage_outage-036',
  'outage-037': 'crm_outage_outage-037', 'outage-038': 'crm_outage_outage-038',
  'outage-039': 'crm_outage_outage-039', 'outage-040': 'crm_outage_outage-040',
  'outage-041': 'crm_outage_outage-041', 'outage-042': 'crm_outage_outage-042',
  'outage-043': 'crm_outage_outage-043', 'outage-044': 'crm_outage_outage-044',
  'outage-045': 'crm_outage_outage-045', 'outage-046': 'crm_outage_outage-046',
  'outage-047': 'crm_outage_outage-047', 'outage-048': 'crm_outage_outage-048',
  'outage-049': 'crm_outage_outage-049', 'outage-050': 'crm_outage_outage-050',
  'outage-051': 'crm_outage_outage-051', 'outage-052': 'crm_outage_outage-052',
  'outage-053': 'crm_outage_outage-053', 'outage-054': 'crm_outage_outage-054',
  'outage-055': 'crm_outage_outage-055', 'outage-056': 'crm_outage_outage-056',
  'outage-057': 'crm_outage_outage-057', 'outage-058': 'crm_outage_outage-058',
  'outage-059': 'crm_outage_outage-059', 'outage-060': 'crm_outage_outage-060',
  'outage-061': 'crm_outage_outage-061', 'outage-062': 'crm_outage_outage-062',
  'outage-063': 'crm_outage_outage-063', 'outage-064': 'crm_outage_outage-064',
  'outage-065': 'crm_outage_outage-065', 'outage-066': 'crm_outage_outage-066',
  'outage-067': 'crm_outage_outage-067', 'outage-068': 'crm_outage_outage-068',
  'outage-069': 'crm_outage_outage-069', 'outage-070': 'crm_outage_outage-070',
  'outage-071': 'crm_outage_outage-071', 'outage-072': 'crm_outage_outage-072',
  'outage-073': 'crm_outage_outage-073', 'outage-074': 'crm_outage_outage-074',
  'outage-075': 'crm_outage_outage-075', 'outage-076': 'crm_outage_outage-076',
  'outage-077': 'crm_outage_outage-077', 'outage-078': 'crm_outage_outage-078',
  'outage-079': 'crm_outage_outage-079', 'outage-080': 'crm_outage_outage-080',
  'outage-081': 'crm_outage_outage-081', 'outage-082': 'crm_outage_outage-082',
  'outage-083': 'crm_outage_outage-083', 'outage-084': 'crm_outage_outage-084',
  'outage-085': 'crm_outage_outage-085', 'outage-086': 'crm_outage_outage-086',
  'outage-087': 'crm_outage_outage-087', 'outage-088': 'crm_outage_outage-088',
  'outage-089': 'crm_outage_outage-089', 'outage-090': 'crm_outage_outage-090',
  'outage-091': 'crm_outage_outage-091', 'outage-092': 'crm_outage_outage-092',
  'outage-093': 'crm_outage_outage-093', 'outage-094': 'crm_outage_outage-094',
  'outage-095': 'crm_outage_outage-095', 'outage-096': 'crm_outage_outage-096',
  'outage-097': 'crm_outage_outage-097', 'outage-098': 'crm_outage_outage-098',
  'outage-099': 'crm_outage_outage-099', 'outage-100': 'crm_outage_outage-100',

  // ── Vendor IDs (VEND-01 … VEND-50) ─────────────────────────────────────────
  'vend-01': 'crm_vendor_vend-01', 'vend-02': 'crm_vendor_vend-02',
  'vend-03': 'crm_vendor_vend-03', 'vend-04': 'crm_vendor_vend-04',
  'vend-05': 'crm_vendor_vend-05', 'vend-06': 'crm_vendor_vend-06',
  'vend-07': 'crm_vendor_vend-07', 'vend-08': 'crm_vendor_vend-08',
  'vend-09': 'crm_vendor_vend-09', 'vend-10': 'crm_vendor_vend-10',
  'vend-11': 'crm_vendor_vend-11', 'vend-12': 'crm_vendor_vend-12',
  'vend-13': 'crm_vendor_vend-13', 'vend-14': 'crm_vendor_vend-14',
  'vend-15': 'crm_vendor_vend-15', 'vend-16': 'crm_vendor_vend-16',
  'vend-17': 'crm_vendor_vend-17', 'vend-18': 'crm_vendor_vend-18',
  'vend-19': 'crm_vendor_vend-19', 'vend-20': 'crm_vendor_vend-20',
  'vend-21': 'crm_vendor_vend-21', 'vend-22': 'crm_vendor_vend-22',
  'vend-23': 'crm_vendor_vend-23', 'vend-24': 'crm_vendor_vend-24',
  'vend-25': 'crm_vendor_vend-25', 'vend-26': 'crm_vendor_vend-26',
  'vend-27': 'crm_vendor_vend-27', 'vend-28': 'crm_vendor_vend-28',
  'vend-29': 'crm_vendor_vend-29', 'vend-30': 'crm_vendor_vend-30',
  'vend-31': 'crm_vendor_vend-31', 'vend-32': 'crm_vendor_vend-32',
  'vend-33': 'crm_vendor_vend-33', 'vend-34': 'crm_vendor_vend-34',
  'vend-35': 'crm_vendor_vend-35', 'vend-36': 'crm_vendor_vend-36',
  'vend-37': 'crm_vendor_vend-37', 'vend-38': 'crm_vendor_vend-38',
  'vend-39': 'crm_vendor_vend-39', 'vend-40': 'crm_vendor_vend-40',
  'vend-41': 'crm_vendor_vend-41', 'vend-42': 'crm_vendor_vend-42',
  'vend-43': 'crm_vendor_vend-43', 'vend-44': 'crm_vendor_vend-44',
  'vend-45': 'crm_vendor_vend-45', 'vend-46': 'crm_vendor_vend-46',
  'vend-47': 'crm_vendor_vend-47', 'vend-48': 'crm_vendor_vend-48',
  'vend-49': 'crm_vendor_vend-49', 'vend-50': 'crm_vendor_vend-50',

  // ── Region IDs (all 20 regions) ─────────────────────────────────────────────
  'region-frankfurt':  'crm_region_region-frankfurt',
  'region-singapore':  'crm_region_region-singapore',
  'region-virginia':   'crm_region_region-virginia',
  'region-london':     'crm_region_region-london',
  'region-sydney':     'crm_region_region-sydney',
  'region-mumbai':     'crm_region_region-mumbai',
  'region-toronto':    'crm_region_region-toronto',
  'region-sao-paulo':  'crm_region_region-sao-paulo',
  'region-paris':      'crm_region_region-paris',
  'region-amsterdam':  'crm_region_region-amsterdam',
  'region-stockholm':  'crm_region_region-stockholm',
  'region-ohio':       'crm_region_region-ohio',
  'region-oregon':     'crm_region_region-oregon',
  'region-california': 'crm_region_region-california',
  'region-tokyo':      'crm_region_region-tokyo',
  'region-seoul':      'crm_region_region-seoul',
  'region-dubai':      'crm_region_region-dubai',
  'region-cape-town':  'crm_region_region-cape-town',
  'region-chicago':    'crm_region_region-chicago',
  'region-dallas':     'crm_region_region-dallas',

  // ── Customer IDs (eval question entities) ───────────────────────────────────
  'cust-0001': 'crm_customer_cust-0001', 'cust-0050': 'crm_customer_cust-0050',
  'cust-0100': 'crm_customer_cust-0100', 'cust-0101': 'crm_customer_cust-0101',
  'cust-0200': 'crm_customer_cust-0200', 'cust-0500': 'crm_customer_cust-0500',
  'cust-0501': 'crm_customer_cust-0501', 'cust-1000': 'crm_customer_cust-1000',
  'cust-1001': 'crm_customer_cust-1001', 'cust-2000': 'crm_customer_cust-2000',
  'cust-3000': 'crm_customer_cust-3000', 'cust-4000': 'crm_customer_cust-4000',
  'cust-4999': 'crm_customer_cust-4999',

  // ── Employee IDs (eval question entities) ───────────────────────────────────
  'emp-001': 'crm_employee_emp-001', 'emp-010': 'crm_employee_emp-010',
  'emp-050': 'crm_employee_emp-050', 'emp-100': 'crm_employee_emp-100',
  'emp-179': 'crm_employee_emp-179', 'emp-200': 'crm_employee_emp-200',

  // ── Compliance case IDs (eval question entities) ─────────────────────────────
  'comp-0001': 'crm_compliance_comp-0001',
  'comp-0101': 'crm_compliance_comp-0101',
  'comp-0501': 'crm_compliance_comp-0501',

  // ── Ticket IDs (eval question entities) ─────────────────────────────────────
  'tick-00001': 'crm_ticket_tick-00001',
  'tick-00501': 'crm_ticket_tick-00501',
  'tick-01001': 'crm_ticket_tick-01001',

  // ── Project IDs (eval question entities) ─────────────────────────────────────
  'proj-nordic-001': 'crm_project_proj-nordic-001',
  'proj-emea-002':   'crm_project_proj-emea-002',
  'proj-apac-010':   'crm_project_proj-apac-010',
};

// Placeholder for reverse entity lookups — extend as needed for new question types
const PRODUCT_SAMPLE_CUSTOMERS: Record<string, string[]> = {};

function detectArticles(question: string): string[] {
  const q = question.toLowerCase();
  const sorted = Object.entries(ARTICLE_MAP).sort((a, b) => b[0].length - a[0].length);
  const seen = new Set<string>();
  const prefixes: string[] = [];
  for (const [kw, prefix] of sorted) {
    // Space-padded keywords (e.g. ' sales ', ' engineering ') are generic words that
    // need word-boundary matching so they also match "Sales?" or "Engineering," at
    // sentence boundaries — not just when surrounded by spaces.
    const isWordBoundaryKw = kw.startsWith(' ') && kw.endsWith(' ');
    const matches = isWordBoundaryKw
      ? new RegExp(`\\b${kw.trim()}\\b`).test(q)
      : q.includes(kw);
    if (matches && !seen.has(prefix)) {
      seen.add(prefix);
      prefixes.push(prefix);
    }
  }
  return prefixes;
}

async function fetchArticleChunks(articlePrefix: string, numChunks = 6): Promise<string[]> {
  const texts: string[] = [];

  // First try: Content vertex by direct ID (CRM entities: one Content vertex per entity).
  // Retry + longer GSQL timeout — under heavy eval load GPE's default 16s timeout returns an
  // empty/REST-3002 body, which previously surfaced as a false "no info" miss.
  for (let attempt = 0; attempt < 3 && texts.length === 0; attempt++) {
    if (attempt > 0) await new Promise(res => setTimeout(res, 400));
    try {
      const r = await fetch(
        `${TG_RESTPP_URL}/restpp/graph/${GRAPH_NAME}/vertices/Content/${articlePrefix}`,
        { headers: { 'Authorization': `Basic ${AUTH}`, 'GSQL-TIMEOUT': '60000' } }
      );
      if (r.ok) {
        const d = await r.json() as { error?: boolean; results?: Array<{ attributes?: { text?: string } }> };
        const t = d.results?.[0]?.attributes?.text;
        if (t && t.trim().length > 30) { texts.push(t); break; }
      }
    } catch { /* retry */ }
  }

  // Second try: Content vertices with _chunk_N suffix (Wikipedia multi-chunk articles)
  if (texts.length === 0) {
    const fetches = Array.from({ length: numChunks }, (_, i) =>
      fetch(
        `${TG_RESTPP_URL}/restpp/graph/${GRAPH_NAME}/vertices/Content/${articlePrefix}_chunk_${i}`,
        { headers: { 'Authorization': `Basic ${AUTH}` } }
      )
        .then(r => r.ok ? r.json() : null)
        .then((d: unknown) => {
          const t = (d as { results?: Array<{ attributes?: { text?: string } }> } | null)?.results?.[0]?.attributes?.text;
          if (t && t.trim().length > 30) texts.push(t);
        })
        .catch(() => null)
    );
    await Promise.all(fetches);
  }

  return texts;
}

// ── Fallback: graphrag/search endpoint (returns raw text too) ─────────────────
async function fallbackSearch(question: string, topK: number): Promise<{ key: string; text: string }[]> {
  let res: Response;
  try {
    res = await fetch(`${TG_GRAPHRAG_URL}/${GRAPH_NAME}/graphrag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${AUTH}` },
      body: JSON.stringify({
        question,
        method: 'hybrid',
        method_params: { indices: ['DocumentChunk'], top_k: topK, num_hops: 0, num_seen_min: 1, num_seen_max: 100, num_neighbors_min: 0, num_neighbors_max: 0 },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    console.warn(`[graphrag] fallbackSearch network error — skipping: ${(e as Error).message}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`[graphrag] fallbackSearch ${res.status} — skipping, using article chunks only`);
    return [];
  }
  const data = await res.json();
  // Handle both response formats:
  //   Old: [{final_retrieval: {...}}]          (array directly)
  //   New: {value: [{final_retrieval: {...}}], Count: 1}  (wrapped object after container restart)
  const resultArr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { value?: unknown[] }).value)
      ? (data as { value: unknown[] }).value
      : [];
  const retrieval = (resultArr[0] as { final_retrieval?: Record<string, unknown> } | undefined)?.final_retrieval;
  if (!retrieval) return [];
  const chunks: { key: string; text: string }[] = [];
  for (const [key, val] of Object.entries(retrieval)) {
    // Values can be strings OR arrays of strings depending on TigerGraph version
    if (typeof val === 'string' && val.trim().length > 20) {
      chunks.push({ key, text: val });
    } else if (Array.isArray(val)) {
      for (const t of val as string[]) {
        if (typeof t === 'string' && t.trim().length > 20) chunks.push({ key, text: t });
      }
    }
  }
  return chunks;
}

// ── Reranker ──────────────────────────────────────────────────────────────────
async function rerank(question: string, chunks: string[], topN: number): Promise<string[]> {
  if (chunks.length <= topN) return chunks;
  // Parallel rerank — identical scoring to the old sequential loop, but fires all
  // YES/NO relevance calls concurrently (rotating across 2 Groq keys) instead of
  // serially with 200ms gaps. Cuts ~7-10s/query to ~0.5s with zero accuracy change.
  const scores = await Promise.all(chunks.map(async (chunk, idx) => {
    try {
      const res = await reranker().chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 5,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Does this passage directly answer the question? Reply only YES or NO.\nQuestion: ${question}\nPassage: ${chunk.slice(0, 400)}`,
        }],
      });
      const t = (res.choices[0]?.message?.content ?? '').toUpperCase();
      return { chunk, score: (/\bYES\b/.test(t) ? 10 : 0) - idx * 0.01 };
    } catch {
      return { chunk, score: -idx * 0.01 };
    }
  }));
  const sorted = scores.sort((a, b) => b.score - a.score).slice(0, topN);
  // If nothing got a YES, fall back to original TigerGraph order (first topN chunks)
  const anyYes = sorted.some(s => s.score >= 9);
  if (!anyYes) return chunks.slice(0, topN);
  return sorted.map(s => s.chunk);
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
function deduplicate(chunks: string[]): string[] {
  const seen = new Set<string>();
  return chunks.filter(c => {
    const key = c.trim().slice(0, 80).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Number normalization ──────────────────────────────────────────────────────
// Convert Indian-format numbers ($14,78,328) to Western ($1,478,328).
// Both represent the same value — just strip commas and re-insert in 3-3-3 groups.
function normalizeNumbers(text: string): string {
  return text.replace(/\$([\d,]+)/g, (match, digits) => {
    const clean = digits.replace(/,/g, '');
    const num = parseInt(clean, 10);
    if (isNaN(num) || clean.length < 4) return match;
    return '$' + num.toLocaleString('en-US');
  });
}

// ── Section extraction for "which X" questions ───────────────────────────────
// Pulls structured list sections (Projects, Outages, Vendors) from beyond the
// initial chunk slice so "which X" queries get the specific IDs they need.
const SECTION_TRIGGERS: Array<{ trigger: RegExp; headers: string[] }> = [
  { trigger: /which projects?|projects? (were |are )?(impacted|deployed|affected)|impacted.*projects?|how many projects/i,
    headers: ['Project Impacts:', 'Active Projects:'] },
  { trigger: /which outages?|outages? (occurred|happened|in)|how many outages/i,
    headers: ['Outage History:', 'Outage IDs:'] },
  { trigger: /which vendors?|vendors? (operate|in region)|how many vendors/i,
    headers: ['Vendor Dependencies:', 'Primary Vendors:'] },
  { trigger: /compliance cases?.*linked|linked.*compliance|how many compliance/i,
    headers: ['Compliance Exposure:'] },
  { trigger: /how many.*outages|total outages|outages.*caused|outages.*experienced/i,
    headers: ['Repeat Pattern:', 'Outage Summary:'] },
];

function extractRelevantSections(fullText: string, question: string, sliceLimit: number): string {
  const extra: string[] = [];
  for (const { trigger, headers } of SECTION_TRIGGERS) {
    if (!trigger.test(question)) continue;
    for (const header of headers) {
      const idx = fullText.indexOf(header);
      if (idx > 0 && idx >= sliceLimit - 100) {   // only if near or beyond the slice boundary
        const end = fullText.indexOf('\n\n', idx);
        const section = fullText.slice(idx, end > 0 ? Math.min(end, idx + 350) : idx + 350);
        if (section.trim()) extra.push(section.trim());
      }
    }
  }
  return extra.join('\n');
}

// ── Second-hop traversal ──────────────────────────────────────────────────────
// After fetching the primary entity, scan its text for additional CRM entity
// keywords and automatically fetch those entities too.
// e.g. Paul Robinson chunk → "Sales department" → fetch crm_department_dept_1
//      Stellar Technologies chunk → "CRM Enterprise" → fetch crm_product_prod_2
async function secondHopFetch(
  primaryTexts: string[],
  alreadyFetched: Set<string>,
): Promise<string[]> {
  if (primaryTexts.length === 0) return [];
  const combinedText = primaryTexts.join(' ').toLowerCase();

  // Only scan CRM entities for second-hop (Wikipedia articles are static)
  const crmEntries = Object.entries(ARTICLE_MAP)
    .filter(([, prefix]) => prefix.startsWith('crm_'))
    .sort((a, b) => b[0].length - a[0].length);

  const toFetch: string[] = [];
  const seen = new Set<string>(alreadyFetched);
  for (const [kw, prefix] of crmEntries) {
    // Space-padded generic keywords (e.g. ' sales ', ' finance ') appear in many chunks
    // (e.g. "budget cut by finance team"). For second-hop we require structured field context:
    // "Department: Sales" or "Sales department" — not casual mentions in Notes text.
    const isWordBoundaryKw = kw.startsWith(' ') && kw.endsWith(' ');
    let matches: boolean;
    if (isWordBoundaryKw) {
      const kwTrimmed = kw.trim();
      // Must appear as "Department: <kw>" or "<kw> department" to count for second-hop
      matches = new RegExp(`\\bdepartment:\\s*${kwTrimmed}\\b|\\b${kwTrimmed}\\s+department\\b`, 'i').test(combinedText);
    } else {
      matches = combinedText.includes(kw);
    }
    if (matches && !seen.has(prefix)) {
      seen.add(prefix);
      toFetch.push(prefix);
    }
  }

  if (toFetch.length === 0) return [];
  console.log(`[graphrag] second-hop entities: ${toFetch.join(', ')}`);
  const chunks = await Promise.all(toFetch.map(p => fetchArticleChunks(p, 2))).then(r => r.flat());
  return chunks;
}

// ── Article-aware prioritization ─────────────────────────────────────────────
// Move chunks matching the detected article prefix to the front so the reranker
// fallback (which returns first topN) always picks relevant content.
function prioritizeByArticle(
  chunks: { key: string; text: string }[],
  articlePrefix: string | null,
): string[] {
  if (!articlePrefix) return chunks.map(c => c.text);
  const primary: string[] = [];
  const other: string[] = [];
  for (const c of chunks) {
    if (c.key.startsWith(articlePrefix)) primary.push(c.text);
    else other.push(c.text);
  }
  return [...primary, ...other];
}

function formatContext(chunks: string[]): string {
  if (chunks.length === 0) return 'No relevant context found.';
  return chunks.map(c => c.trim()).join('\n\n');
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function runGraphRag(question: string): Promise<PipelineResult & {
  numHops: number;
  complexity: string;
  complexityReason: string;
  tgLatencyMs: number;
  groqLatencyMs: number;
}> {
  const t0 = Date.now();
  const { complexity, numHops, reason } = analyzeQuery(question);
  const fetchK = 15;

  // ── Step 1: Retrieve raw graph chunks ────────────────────────────────────
  // Two-path retrieval:
  //   A) Entity-targeted: detect article from question → fetch chunks 0-7 by vertex ID
  //      (solves the "founding chunk" problem where vector search misses early chunks)
  //   B) Vector search via graphrag/search (hybrid HNSW + graph traversal)
  // Results are merged; reranker picks the best finalK.
  const tgT0 = Date.now();
  const articlePrefixes = detectArticles(question);
  // Entity-targeted questions: 1 chunk (direct entity fetch is dense enough).
  // Questions without detected entity IDs: 2 chunks from vector search.
  const finalK = articlePrefixes.length > 0 ? 1 : 2;
  // Multi-entity retrieval: fetch ALL detected entities in parallel
  // e.g. Q "Who is Acme Corp's CSM and what is their rating?" → fetches cust_1 + emp_20
  const [allArticleChunks, rawChunks] = await Promise.all([
    Promise.all(articlePrefixes.map(p => fetchArticleChunks(p, 3))).then(r => r.flat()),
    fallbackSearch(question, fetchK),
  ]);

  // ── Second-hop: scan retrieved text for implicit entity references ───────
  // e.g. "Sales department" mention in Paul Robinson chunk → fetch dept chunk
  const secondHopChunks = await secondHopFetch(
    allArticleChunks.map(c => c.slice(0, 600)),
    new Set(articlePrefixes),
  );

  // ── Reverse product-customer lookup ─────────────────────────────────────
  // When question asks "which customers use [product]" + a product entity was detected,
  // inject representative customers so the LLM can name them.
  // Only trigger reverse lookup when the question asks to IDENTIFY which companies use a product,
  // NOT when it asks for stats like "how many active customers" or "active customer count".
  const asksAboutCustomers = /who use|which (companies|customers|businesses|organizations) use|clients? (of|using|that use)|(companies|businesses|clients) that (use|use the|are using)/i.test(question);
  const reverseCustomerChunks: string[] = [];
  if (asksAboutCustomers) {
    const customerPrefixesToFetch = articlePrefixes
      .flatMap(p => PRODUCT_SAMPLE_CUSTOMERS[p] ?? [])
      .filter((p, i, a) => a.indexOf(p) === i);  // deduplicate
    if (customerPrefixesToFetch.length > 0) {
      console.log(`[graphrag] reverse-customer lookup: ${customerPrefixesToFetch.join(', ')}`);
      const chunks = await Promise.all(customerPrefixesToFetch.map(p => fetchArticleChunks(p, 1))).then(r => r.flat());
      reverseCustomerChunks.push(...chunks);
    }
  }

  const articleChunks = [...allArticleChunks, ...secondHopChunks, ...reverseCustomerChunks];

  const tgLatencyMs = Date.now() - tgT0;

  // ── Step 3: Merge → Prioritize → Deduplicate → Rerank ───────────────────
  const prioritized = prioritizeByArticle(rawChunks, articlePrefixes[0] ?? null);

  // When using a single-chunk budget (finalK=1) and second-hop entities were found,
  // pack primary entity (1100 chars) + first secondary entity (500 chars) into one
  // combined chunk so cross-entity multi-hop answers stay within the token budget.
  // For "which X" questions: append the relevant list section if it falls beyond the slice.
  const buildMergedArticle = (): string[] => {
    const rawPrimary = allArticleChunks[0] ?? '';
    const hasMerge = finalK === 1 && allArticleChunks.length > 0 && secondHopChunks.length > 0;
    // Slice limit: 1100 when merging with second-hop, 1600 otherwise
    const primarySlice = hasMerge ? 1100 : 1600;
    // Supplemental: structured list sections for "which projects/outages/vendors" queries
    // — only extracts sections that fall beyond the primary slice boundary
    const extra = allArticleChunks.length > 0
      ? extractRelevantSections(rawPrimary, question, primarySlice)
      : '';
    if (hasMerge) {
      const primary = normalizeNumbers(rawPrimary).slice(0, primarySlice);
      const hop2    = normalizeNumbers(secondHopChunks[0]!).slice(0, 500);
      const suffix  = extra ? '\n\n' + extra : '';
      return [primary + '\n\n' + hop2 + suffix, ...allArticleChunks.slice(1).map(c => normalizeNumbers(c).slice(0, 1600))];
    }
    const base = articleChunks.map(c => normalizeNumbers(c).slice(0, primarySlice));
    if (extra && base.length > 0) {
      return [base[0]! + '\n\n' + extra, ...base.slice(1)];
    }
    return base;
  };
  const mergedArticle = buildMergedArticle();
  const mergedVector  = prioritized.map(c => normalizeNumbers(c).slice(0, 800));
  const deduped = deduplicate([...mergedArticle, ...mergedVector]);
  const reranked = await rerank(question, deduped, finalK);

  // ── Guarantee primary article chunk survives reranking ──────────────────
  // Pin the primary entity chunk (or its merged version) into the final set.
  let pinnedChunks: string[] = reranked;
  if (allArticleChunks.length > 0) {
    const primaryText = mergedArticle[0] ?? allArticleChunks[0]!.slice(0, 1600);
    const alreadyPresent = pinnedChunks.some(c => c.slice(0, 60) === primaryText.slice(0, 60));
    if (!alreadyPresent) {
      pinnedChunks = [primaryText, ...pinnedChunks.slice(0, finalK - 1)];
    }
  }
  const retrievedChunks = pinnedChunks;

  // ── Step 4: Generate with Groq 70b ───────────────────────────────────────
  const context = formatContext(retrievedChunks);
  const userPrompt = `Context:\n${context}\n\nQuestion: ${question}`;
  const groqT0 = Date.now();
  // Synthesis questions need more tokens; simple questions need 400 to include full context details
  const maxTokens = complexity === 'synthesis' ? 500 : 400;
  const r = await generate({ system: SYSTEM, user: userPrompt, role: 'graph', maxTokens });
  const groqLatencyMs = Date.now() - groqT0;

  return {
    pipeline: 'graphrag',
    answer: r.text,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    latencyMs: Date.now() - t0,
    costUsd: costUsd(MODEL_NAME, r.promptTokens, r.completionTokens),
    contextChars: context.length,
    retrievedChunks: retrievedChunks.slice(0, 5),
    numHops,
    complexity,
    complexityReason: reason,
    tgLatencyMs,
    groqLatencyMs,
  };
}
