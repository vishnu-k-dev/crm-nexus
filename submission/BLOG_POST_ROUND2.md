# Your RAG Pipeline Is Bleeding Tokens. We Cut 86% Without Losing Accuracy.

#tigergraph #graphrag #graphdatabase #rag

We were sending ~10,000 tokens per query to the LLM. We got it down to ~1,500 — and got *more* accurate doing it. Here's what we changed, and why flat vector search is the wrong tool for relational data.

We mapped a **158M-token synthetic CRM** into TigerGraph, ran 3 pipelines head-to-head on **90 questions**, and **GraphRAG answered 87/90 (96.7%)** while a well-resourced **BasicRAG managed 64/90 (71.1%)** — at **86% fewer tokens** and **17.5% lower latency**.

## The problem with flat vector search on CRM data

Ask *"How many customers were impacted by OUTAGE-001 through their shared vendor and region?"* — there's no single chunk that answers it. The answer spans multiple hops:

`Outage → Region → Vendor → Customers`

BasicRAG embeds the question and returns chunks ranked by surface similarity. It has no concept of "customers sharing *this* vendor *and* this region." That's structural, not a tuning gap — flat search treats relational data like a document store. It isn't one.

**The honest test:** we gave BasicRAG the relevant documents for every question. It *still* capped at 71.1% — the failures aren't about coverage, they're about reasoning across relationships.

## What we built

Three pipelines on a TigerGraph knowledge graph:

| Pipeline | Retrieval | Avg Tokens | Accuracy |
|---|---|---|---|
| LLM-Only | None | ~14 | 3.3% |
| BasicRAG | Cosine similarity | ~10,867 | 71.1% |
| **GraphRAG** | **HNSW seed + GSQL traversal** | **~1,483** | **96.7%** |

Same LLM (**Gemini 2.5 Flash**). Same 90 questions. Same data. Only retrieval changes.

## The graph

158M tokens of CRM-native data across 100,820 documents — customers, vendors, outages, regions, employees, tickets, compliance cases, projects, all interlinked. Re-chunked and embedded into **577,175 vector chunks** with TigerGraph's native HNSW index — **1.58× the hackathon's 100M-token minimum** (measured via Gemini `count_tokens`).

## How retrieval works

GraphRAG embeds the question, finds seed chunks via TigerGraph's **native HNSW vector search**, traverses typed relationships to pull only the connected context, then reranks to the most relevant. The LLM gets a focused ~1,483-token brief, not a 10K-token wall.

## The evaluation (we were paranoid about grading our own homework)

- **Generator:** Gemini 2.5 Flash — every answer, same model for all 3 pipelines
- **Judge:** Groq Llama 3.1 8B — independent, scores PASS/FAIL blind
- **Semantic eval:** canonical HuggingFace `bert_score` (roberta-large, `rescale_with_baseline=True`) → **F1 raw 0.932 / rescaled 0.599** — clears both bonus bars (≥0.88 raw, ≥0.55 rescaled)

## The numbers that mattered

- **96.7% vs 71.1%** — a 25-point gap on identical data + LLM, purely from retrieval method
- **86.4% fewer tokens** (1,483 vs 10,867) — the cost story; at scale, the difference between a product and a runaway bill
- **17.5% faster** (7.5s vs 9.1s) — traversal is a targeted lookup; BasicRAG pays to embed and rank a large context every query

## The honest version of the TigerGraph setup

Community Edition via Docker. Two real learning curves: **infrastructure** — an unclean shutdown mid-embedding corrupted the graph store once, so we learned to snapshot `gstore` immediately after embedding and before evaluation; and **GSQL** — multi-hop queries and accumulators took time to click, but then ran in milliseconds locally.

## What we'd do differently

- Tune the hybrid HNSW + graph pipeline (hop depth per query type)
- 200 eval questions instead of 90 to tighten confidence intervals
- TigerGraph Savanna (cloud) over local Docker to skip infra debugging

## Stack

| Layer | Technology |
|---|---|
| Graph DB | TigerGraph Community Edition (Docker) |
| Queries | GSQL multi-hop + native HNSW + REST++ |
| Embeddings | Google `gemini-embedding-001` (768-dim) |
| LLM (all pipelines) | Gemini 2.5 Flash |
| Judge | Groq Llama 3.1 8B |
| Semantic eval | HuggingFace `bert_score` (roberta-large) |
| API | Fastify + Node 20 + TypeScript |
| Dashboard | crm-nexus-team-brocode.vercel.app |

GitHub → github.com/vishnu-k-dev/crm-nexus

Built for the **TigerGraph GraphRAG Inference Hackathon 2026** — Team BroCode (Vishnu K & Revanth M)

#TigerGraph #GraphRAG #GraphDatabase #LLM #Hackathon #RAG
