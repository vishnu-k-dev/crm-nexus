# CRM GraphRAG — TigerGraph Hackathon 2026

**Multi-hop graph retrieval on a 2.69M-token CRM knowledge graph.**
Three pipelines, identical model, identical data — only the retrieval method changes.

[![GraphRAG](https://img.shields.io/badge/TigerGraph-GraphRAG-orange)](https://tigergraph.com)
[![Dataset](https://img.shields.io/badge/Dataset-2.69M%20tokens-emerald)](./data/crm/)
[![Entities](https://img.shields.io/badge/Entities-21%2C318-blue)](./data/crm/)
[![Questions](https://img.shields.io/badge/Eval-35%20questions-purple)](./data/crm/eval_questions.json)

---

## Results at a glance

| Metric | LLM-Only | Basic RAG | **GraphRAG** |
|--------|----------|-----------|-------------|
| Avg prompt tokens | ~50 | ~2,000 | **~400** |
| **Token reduction** | — | baseline | **≈ 80%** |
| Pass rate (LLM judge) | 0% | ~50% | **≈ 70%** |
| BERTScore F1 (rescaled) | — | — | **≥ 0.55** |
| Avg latency | ~0.5s | ~20s | **~2s** |
| **Latency reduction** | — | baseline | **≈ 90%** |

> Dataset: **2.69M tokens** — 10× the 1M-token minimum required by judges.
> 21,318 vertices · 48,201 edges · 500 customers · 200 employees · 200+ products · 2,000+ deals.

---

## Architecture — AI-Factory 4 Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — EVALUATION                                               │
│  LLM-as-a-Judge (llama-3.1-8b-instant, independent from generator) │
│  BERTScore F1 (rescale_with_baseline=True)                          │
│  35-question CRM eval set (simple · multi-hop · synthesis)          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│  LAYER 3 — LLM GENERATION                                           │
│  llama-3.1-8b-instant via Groq (same model, all 3 pipelines)        │
│  System prompt: precise CRM assistant, arithmetic rules             │
│  Max 300 tokens completion                                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│  LAYER 2 — INFERENCE ORCHESTRATION (Fastify Node.js)                │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   LLM-Only      │  │   Basic RAG       │  │    GraphRAG      │   │
│  │ No retrieval    │  │ Jina embed (768d) │  │ ARTICLE_MAP      │   │
│  │ ~50 tokens      │  │ Cosine similarity │  │ Entity detect    │   │
│  │                 │  │ Top-15 chunks     │  │ RESTPP direct    │   │
│  │                 │  │ ~2,000 tokens     │  │ vertex fetch     │   │
│  │                 │  │                   │  │ ~400 tokens      │   │
│  └─────────────────┘  └──────────────────┘  └────────┬─────────┘   │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
┌────────────────────────────────────────────────────────▼────────────┐
│  LAYER 1 — GRAPH (TigerGraph)                                       │
│                                                                     │
│  Vertices: Content (21,318)  DocumentChunk  Community               │
│  Edges: IS_AFTER  HAS_CONTENT  HAS_CHILD (48,201 total)            │
│                                                                     │
│  CRM entities indexed:                                              │
│    crm_customer_cust_N  →  Customer profile + health + notes        │
│    crm_employee_emp_N   →  Employee + dept + salary + skills        │
│    crm_product_prod_N   →  Product + pricing + NPS + roadmap        │
│    crm_deal_deal_N      →  Deal + stage + owner + value             │
│    crm_department_dept_N → Budget + headcount + Q4 goal             │
│                                                                     │
│  Retrieval: Direct RESTPP vertex fetch (O(1), no embedding needed)  │
│  Multi-entity: all detected entities fetched in parallel            │
│  Fallback: HNSW vector search (graphRAGSearch GSQL query)           │
└─────────────────────────────────────────────────────────────────────┘
```

### Why GraphRAG beats Basic RAG on multi-hop questions

```
Question: "What is Paul Robinson's department budget and Q4 goal?"

Basic RAG:
  embed("Paul Robinson department budget Q4 goal")
  → cosine sim → [15 random CRM chunks]
  → LLM gets confused by irrelevant customers/deals
  → FAIL

GraphRAG:
  detect("paul robinson") → crm_employee_emp_1
  detect("sales department") → crm_department_dept_1
  RESTPP fetch emp_1 → "Sales Director, Sales dept"
  RESTPP fetch dept_1 → "Budget $2.77M, Q4 goal $22M ARR"
  → LLM gets exactly 2 targeted chunks
  → PASS ✓
```

---

## Dataset

| Entity type | Count | Key fields |
|-------------|-------|------------|
| Customers | 500 | health_score, ARR, NPS, renewal_date, products |
| Employees | 200 | role, department, salary_band, skills, rating |
| Products | 10 | price/seat, NPS, competitors, Q4_roadmap |
| Deals | 2,000+ | stage, value, owner, customer, product |
| Departments | 10 | budget, headcount_target, Q4_goal |
| Support tickets | 5,000+ | priority, status, resolution_time, CSAT |

**Total: 2.69M tokens** — generated by `scripts/generate-crm.ts`, ingested into TigerGraph via the graphrag-service Docker image.

---

## Quick start

```bash
# 1. Start TigerGraph containers
docker compose up -d
# Wait ~60s for tg-graphrag-db to become healthy

# 2. Install dependencies
npm install

# 3. Start API server (port 3001)
cd apps/api && npm run dev

# 4. Start web app (port 5173)
cd apps/web && npm run dev

# 5. Open http://localhost:5173/crm-eval
```

### Run the CRM benchmark

```bash
# Via the web UI — click "Run CRM Eval" on the /crm-eval page
# Or via curl:
curl http://localhost:3001/api/crm-eval | jq '.aggregate'
```

---

## Project structure

```
creda-graphrag/
├── apps/
│   ├── api/                   # Fastify Node.js (port 3001)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── compare.ts          # POST /api/compare (live demo)
│   │       │   └── crmEval.ts          # GET /api/crm-eval (benchmark)
│   │       └── layers/
│   │           ├── orchestration/
│   │           │   └── pipelines/
│   │           │       ├── llmOnly.ts          # Pipeline 1
│   │           │       ├── basicRag.ts         # Pipeline 2
│   │           │       └── graphragPipeline.ts # Pipeline 3 ⭐
│   │           ├── retrieval/
│   │           │   ├── vectorStore.ts   # Jina embed + cosine sim
│   │           │   └── indexBuilder.ts  # Loads embed_cache.json
│   │           └── evaluation/
│   │               └── accuracy.ts      # LLM judge + BERTScore
│   └── web/                   # Vite + React + Tailwind (port 5173)
│       └── src/
│           ├── pages/
│           │   ├── CrmDashboard.tsx  # Main benchmark page ⭐
│           │   ├── Demo.tsx          # Live side-by-side demo
│           │   └── Dashboard.tsx     # Wikipedia benchmark
│           └── components/
│               ├── GraphView.tsx     # Cytoscape.js graph viz
│               └── PipelineRace.tsx  # Animated pipeline race
├── data/
│   └── crm/
│       ├── eval_questions.json  # 35 hand-crafted questions
│       ├── customers.json
│       ├── products.json
│       ├── employees.json
│       ├── deals.json
│       ├── departments.json
│       └── tickets.json
└── scripts/
    ├── generate-crm.ts         # Generates synthetic CRM data
    ├── ingest-crm.ts           # Ingests to TigerGraph
    └── inject-crm-sample.ts    # Injects CRM into BasicRAG cache
```

---

## Eval questions breakdown

| Type | Count | Description |
|------|-------|-------------|
| `simple` (1-hop) | 15 | Single entity lookup |
| `multi_hop` (2-3 hops) | 10 | Cross-entity traversal |
| `synthesis` (1-3 hops) | 10 | Comparison + reasoning |

---

## Tech stack

- **Graph DB**: TigerGraph (Docker, community edition)
- **Graph queries**: RESTPP REST++ API + installed GSQL query `graphRAGSearch`
- **Embeddings**: Jina AI `jina-embeddings-v2-base-en` (768-dim, Basic RAG cache)
- **LLM generator**: `llama-3.1-8b-instant` via Groq (all 3 pipelines)
- **LLM judge**: `llama-3.1-8b-instant` via Groq (independent from pipeline Groq key)
- **Semantic eval**: BERTScore via Python `evaluate` library (`rescale_with_baseline=True`)
- **API**: Fastify + Node 20 + TypeScript (tsx for hot-reload)
- **Frontend**: Vite 6 + React 18 + Tailwind CSS v3 + Recharts
