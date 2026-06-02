# CRM Nexus — TigerGraph GraphRAG Inference Hackathon 2026

**Multi-hop graph retrieval on a 158M-token synthetic CRM knowledge graph.**  
Three pipelines, identical LLM, identical data — only the retrieval method changes.

**Team BroCode** · Vishnu K & Revanth M

[![Live Dashboard](https://img.shields.io/badge/Dashboard-Live-orange)](https://crm-nexus-team-brocode.vercel.app)
[![TigerGraph](https://img.shields.io/badge/TigerGraph-Community%20Edition-orange)](https://tigergraph.com)
[![Dataset](https://img.shields.io/badge/Dataset-158M%20tokens-blue)](./data/)
[![Eval](https://img.shields.io/badge/Eval-90%20questions-purple)](./data/crm_eval_results.json)

---

## Results (final — 2026-06-02)

| Metric | LLM-Only | BasicRAG | **CRM Nexus (GraphRAG)** |
|--------|----------|----------|--------------------------|
| Accuracy (LLM-judge PASS) | 3.3% (3/90) | 71.1% (64/90) | **96.7% (87/90)** |
| Avg prompt tokens | — | ~10,867 | **~1,483** |
| Token reduction vs BasicRAG | — | baseline | **86.4% fewer** |
| Avg latency | — | ~9,090 ms | **~7,495 ms** |
| Latency reduction vs BasicRAG | — | baseline | **17.5% faster** |
| Semantic Similarity F1 | 0.564 | 0.754 | **0.865** |

> Same LLM (`gemini-2.5-flash`) for all three pipelines — only retrieval differs.  
> Dataset: **158M tokens / 100,820 documents** — 1.58× the 100M-token hackathon minimum.  
> Graph: **35,820 vertices · 195,133 edges** across 8 entity types and 12 relationship types.

---

## Architecture — AI-Factory 4 Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 4 — EVALUATION                                            │
│  Judge: Groq · Llama 3.1 8B (independent from generator)        │
│  PASS / FAIL per question + Jina cosine semantic similarity F1   │
│  90-question CRM eval set (50 single-hop · 40 multi-hop)        │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 3 — LLM GENERATION                                        │
│  Google Gemini 2.5 Flash (same model, all 3 pipelines)          │
│  ~1,483 avg prompt tokens (GraphRAG) vs ~10,867 (BasicRAG)      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 2 — INFERENCE ORCHESTRATION (Fastify · Node 20)           │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │  LLM-Only   │  │   BasicRAG       │  │   CRM Nexus       │   │
│  │ No retrieval│  │ Jina embed 768d  │  │ Entity detection  │   │
│  │             │  │ Cosine sim       │  │ GSQL 3-hop query  │   │
│  │             │  │ Flat vector store│  │ HNSW vector seed  │   │
│  │             │  │ ~10,867 tokens   │  │ ~1,483 tokens ⭐  │   │
│  └──────────────┘  └─────────────────┘  └────────┬──────────┘   │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
┌────────────────────────────────────────────────────▼─────────────┐
│  LAYER 1 — GRAPH (TigerGraph Community Edition)                  │
│                                                                  │
│  Vertices: 35,820  (Customer · Vendor · Outage · Region · ...)  │
│  Edges:   195,133  (12 relationship types)                       │
│  577,175 embedded chunks — HNSW vector index                     │
│                                                                  │
│  Key GSQL query — multi-hop traversal:                           │
│    Customer → Vendor → Outage → Region                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why GraphRAG beats BasicRAG on CRM questions

BasicRAG scored **71.1%** even with a fair index guaranteed to contain every eval entity's documents. The remaining gap is **structural**: flat cosine similarity has no concept of graph edges — it cannot answer multi-hop questions like:

> *"How many customers were directly impacted by OUTAGE-001 through shared vendor and region dependency?"*

```
BasicRAG:
  embed("customers impacted OUTAGE-001 vendor region") → cosine sim
  → chunks ranked by surface similarity, no traversal possible
  → FAIL

CRM Nexus:
  detect("OUTAGE-001") → seed vertex
  GSQL hop 1: OUTAGE-001 → REGION-FRANKFURT, VEND-01
  GSQL hop 2: VEND-01 + REGION-FRANKFURT → 8 matching customers
  → 1,483 tokens of targeted context
  → PASS ✓  (8 customers: CUST-0001, CUST-0021, …)
```

The 3 questions GraphRAG missed (87/90) are hard multi-hop **aggregation** questions — an honest, known limitation.

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/vishnu-k-dev/-creda-graphrag.git
cd creda-graphrag && npm install

# 2. Copy env and fill in keys
cp .env.example .env

# 3. Start TigerGraph (Docker)
docker compose up -d

# 4. Start API (port 3001)
npm run dev:api

# 5. Open the dashboard
open web/index.html
```

### Run the full benchmark

```bash
curl http://localhost:3001/api/crm-eval | jq '.aggregate'
```

Results saved to `data/crm_eval_results.json`.

---

## Project structure

```
creda-graphrag/
├── web/                        # Static dashboard (no build step)
│   ├── index.html              # Main demo page ⭐
│   ├── styles.css
│   ├── app.js
│   └── assets/
├── apps/
│   └── api/                    # Fastify Node.js (port 3001)
│       └── src/
│           ├── routes/
│           │   └── crmEval.ts  # GET /api/crm-eval, POST /api/compare
│           └── layers/
│               ├── orchestration/pipelines/
│               │   ├── llmOnly.ts
│               │   ├── basicRag.ts
│               │   └── graphragPipeline.ts  ⭐
│               ├── retrieval/vectorStore.ts
│               └── evaluation/accuracy.ts
├── data/
│   └── crm_eval_results.json   # Final benchmark results (90 questions)
├── BENCHMARK_PROOF.md          # Full methodology + per-question breakdown
├── DEMO_PRESENTATION.md        # Presentation playbook
└── DEMO_VIDEO_SCRIPT.md        # Video script + shot list
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Graph DB | TigerGraph Community Edition (Docker) |
| Graph queries | GSQL multi-hop + HNSW native vector index |
| Embeddings | Jina AI `jina-embeddings-v2-base-en` (768-dim) |
| LLM generator | Google `gemini-2.5-flash` (all 3 pipelines) |
| LLM judge | `llama-3.1-8b-instant` via Groq |
| Semantic eval | Jina cosine similarity (rescaled, baseline 0.60) |
| API | Fastify + Node 20 + TypeScript |
| Dashboard | Vanilla HTML/CSS/JS (zero dependencies) |
