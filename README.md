# CRM Nexus — TigerGraph GraphRAG Inference Hackathon 2026

**Multi-hop graph retrieval on a 2.69M-token synthetic CRM knowledge graph.**  
Three pipelines, identical LLM, identical data — only the retrieval method changes.

**Team BroCode** · Vishnu K & Revanth M

[![Live Dashboard](https://img.shields.io/badge/Dashboard-Live-orange)](https://crm-nexus.vercel.app)
[![TigerGraph](https://img.shields.io/badge/TigerGraph-Community%20Edition-orange)](https://tigergraph.com)
[![Dataset](https://img.shields.io/badge/Dataset-2.69M%20tokens-blue)](./data/crm/)
[![Eval](https://img.shields.io/badge/Eval-36%20questions-purple)](./crm_eval_results_v6.json)

---

## Results

| Metric | LLM-Only | BasicRAG | **CRM Nexus (GraphRAG)** |
|--------|----------|----------|--------------------------|
| LLM Judge pass rate | 8.3% | 38.9% | **97.2%** |
| Avg prompt tokens | ~50 | ~2,124 | **~584** |
| Token reduction vs BasicRAG | — | baseline | **72.5%** |
| Avg latency | ~1s | ~78.5s | **~9.9s** |
| Latency reduction vs BasicRAG | — | baseline | **87.4%** |
| BERTScore F1 (rescaled) | — | — | **0.59** (target ≥ 0.55 ✓) |
| Questions answered / 36 | 36/36 | 14/36 | **36/36** |

> Dataset: **2.69M tokens** — 2.7× the 1M-token minimum required by judges.  
> 21,318 vertices · 48,201 edges · 7,500 deals · 6,000 customers · 4,318 employees · 5 products.

---

## Architecture — AI-Factory 4 Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 4 — EVALUATION                                            │
│  Judge: Llama 4 Scout 17B (meta-llama/llama-4-scout-17b-16e)    │
│  Independent from generator — PASS / FAIL per question          │
│  BERTScore F1 rescale_with_baseline=True                        │
│  36-question CRM eval set (simple · multi-hop · synthesis)      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 3 — LLM GENERATION                                        │
│  Llama 3.3 70B via Groq (same model, all 3 pipelines)           │
│  Max 300 completion tokens                                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  LAYER 2 — INFERENCE ORCHESTRATION (Fastify · Node 20)           │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │  LLM-Only   │  │   BasicRAG       │  │   CRM Nexus       │   │
│  │ No retrieval│  │ Jina embed 768d  │  │ Entity detection  │   │
│  │ ~50 tokens  │  │ Cosine sim       │  │ GSQL 3-hop query  │   │
│  │             │  │ Top-15 chunks    │  │ HNSW vector seed  │   │
│  │             │  │ ~2,124 tokens    │  │ ~584 tokens ⭐    │   │
│  └──────────────┘  └─────────────────┘  └────────┬──────────┘   │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
┌────────────────────────────────────────────────────▼─────────────┐
│  LAYER 1 — GRAPH (TigerGraph Community Edition)                  │
│                                                                  │
│  Vertices: 21,318  (Customer · Deal · Employee · Dept · Product) │
│  Edges:    48,201  (OWNS · WORKS_IN · USES · COMPETES_WITH ...)  │
│                                                                  │
│  Key GSQL query — 3-hop traversal:                               │
│    Contact → Deal → Account → Territory                          │
│    Returns 3 targeted chunks vs BasicRAG's 15 random ones        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why GraphRAG beats BasicRAG on CRM questions

```
Question: "What is Pinnacle Enterprises' renewal risk?"

BasicRAG:
  embed("Pinnacle renewal risk") → cosine sim
  → 15 unrelated chunks (no "Pinnacle" in flat store)
  → FAIL

CRM Nexus:
  detect("pinnacle") → vertex pinn
  GSQL hop 1: pinn → CRM Enterprise, Analytics Pro
  GSQL hop 2: pinn → deal_2 ($312k, Renewal stage)
  GSQL hop 3: deal_2 → Marcus L. (owner)
  → 4 targeted chunks, 562 tokens
  → PASS ✓
```

BasicRAG answered only **14/36** questions — CRM entities like "Acme Corp" and "LoneStar" aren't indexable by flat cosine similarity. Every entity lives in TigerGraph.

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/vishnu-k-dev/crm-nexus.git
cd crm-nexus && npm install

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

Results saved to `crm_eval_results.json`.

---

## Project structure

```
crm-nexus/
├── web/                        # Static dashboard (no build step)
│   ├── index.html              # Main dashboard ⭐
│   ├── styles.css
│   ├── app.js
│   └── assets/
├── apps/
│   └── api/                    # Fastify Node.js (port 3001)
│       └── src/
│           ├── routes/
│           │   └── crmEval.ts  # GET /api/crm-eval, POST /api/crm-eval/question
│           └── layers/
│               ├── orchestration/pipelines/
│               │   ├── llmOnly.ts
│               │   ├── basicRag.ts
│               │   └── graphragPipeline.ts  ⭐
│               ├── retrieval/vectorStore.ts
│               └── evaluation/accuracy.ts   # Judge + BERTScore
├── data/crm/
│   └── eval_questions.json     # 36 hand-crafted questions
├── crm_eval_results_v6.json    # Final benchmark results
├── vercel.json                 # Deploy web/ to Vercel
└── render.yaml                 # Deploy API to Render
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Graph DB | TigerGraph Community Edition (Docker) |
| Graph queries | GSQL multi-hop + RESTPP REST++ API |
| Embeddings | Jina AI `jina-embeddings-v2-base-en` (768-dim) |
| LLM generator | `llama-3.3-70b-versatile` via Groq |
| LLM judge | `meta-llama/llama-4-scout-17b-16e-instruct` via Groq |
| Semantic eval | BERTScore (`rescale_with_baseline=True`) |
| API | Fastify + Node 20 + TypeScript |
| Dashboard | Vanilla HTML/CSS/JS (zero dependencies) |
