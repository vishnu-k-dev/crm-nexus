# How We Beat BasicRAG by 72.5% — Building GraphRAG on TigerGraph for a CRM Knowledge Graph

**TL;DR:** We mapped a 2.69M-token synthetic CRM dataset into TigerGraph, ran 3 pipelines head-to-head on 36 questions, and GraphRAG answered 35/36 at 97.2% accuracy while BasicRAG managed only 14/36. Here's how we built it and what we learned.

---

## The Problem with Flat Vector Search on CRM Data

When someone asks *"What is Pinnacle Enterprises' renewal risk?"* — there's no single chunk of text that answers that. The answer lives across three graph hops:

```
Customer → Deals → Deal Owner → Territory
```

BasicRAG embeds the question, runs cosine similarity against 2,124 tokens of raw text, and returns chunks that don't mention "Pinnacle" at all. It answered **14 out of 36** questions correctly.

This is the core insight we built CRM Nexus around: **CRM data is inherently relational. Flat vector search treats it like a document store. It isn't one.**

---

## What We Built

CRM Nexus is a three-pipeline inference system sitting on top of a TigerGraph knowledge graph:

| Pipeline | Retrieval | Avg Tokens | Accuracy |
|----------|-----------|------------|----------|
| LLM-Only | None | ~50 | 8.3% |
| BasicRAG | Cosine similarity | ~2,124 | 38.9% |
| **GraphRAG** | **GSQL 3-hop traversal** | **~584** | **97.2%** |

Same LLM (Llama 3.3 70B via Groq). Same 36 questions. Only retrieval changes.

---

## The Graph

21,318 vertices. 48,201 edges. 2.69M tokens of synthetic CRM data:

- 7,500 Deals (stage, value, owner, close date)
- 6,000 Customers (health score, ARR, NPS, renewal date)
- 4,318 Employees (role, department, skills)
- 5 Products with competitors and roadmap
- 5 Departments with Q4 goals

Every record is CRM-native — no Wikipedia articles, no generic text. Designed to expose flat vector search failures on relational queries.

---

## The GSQL Query That Powers It

```gsql
CREATE QUERY getRelevantContext(STRING entity_name) FOR GRAPH CRM {
  Start = {Customer.*};
  
  Matched = SELECT c FROM Start:c
            WHERE c.name LIKE "%" + entity_name + "%";
  
  Deals = SELECT d FROM Matched:c -(OWNS)-> Deal:d;
  
  Owners = SELECT e FROM Deals:d -(MANAGED_BY)-> Employee:e;
  
  PRINT Matched, Deals, Owners;
}
```

3 hops. 584 tokens returned. The LLM gets exactly what it needs — not a wall of text.

---

## The TigerGraph Setup (Honest Version)

We ran TigerGraph Community Edition via Docker. First attempt — REST++ calls timed out because port 9000 wasn't exposed correctly in our docker-compose config. Spent a few hours on that before it was obvious it was a port mapping issue, not TigerGraph itself.

The bigger learning curve was GSQL. Different enough from SQL that our first multi-hop queries threw compile errors we didn't understand. Once we grasped how **accumulators** work — thread-safe variables that aggregate across parallel traversals — everything clicked. The 3-hop query took about a day to write correctly, but once it ran it was consistently under 200ms on a 48K-edge local graph.

---

## The Evaluation Setup

We were paranoid about grading our own homework. So:

- **Generator:** Llama 3.3 70B (Groq) — produces the answer
- **Judge:** Llama 4 Scout 17B (`meta-llama/llama-4-scout-17b-16e-instruct`) — independent, scores PASS/FAIL per question
- **Semantic eval:** BERTScore F1 → **0.94**

The judge never knows which pipeline produced which answer. Outputs evaluated blind.

---

## The Numbers That Surprised Us

**BasicRAG failed on entity-specific questions** — not because of bad embeddings, but because CRM entities like "Acme Corp" or "LoneStar" don't appear in enough text chunks to surface via cosine similarity. They live in structured records. BasicRAG was flying blind on 22 of 36 questions.

**72.5% token reduction** meant cost per query dropped from ₹0.125 (BasicRAG) to ₹0.049 (GraphRAG) — 61% cheaper, while being more accurate.

**87.4% faster** — 9.9s average vs 78.5s. BasicRAG's latency came from embedding and ranking 15 chunks. Graph traversal is a targeted lookup.

---

## The Live Dashboard

Static site (vanilla HTML/CSS/JS, zero build step) deployed on Vercel. Shows graph traversal hop-by-hop in real time — watch the query walk Customer → Deal → Employee as it resolves.

**Live:** [crm-nexus-team-brocode.vercel.app](https://crm-nexus-team-brocode.vercel.app)  
**GitHub:** [github.com/vishnu-k-dev/crm-nexus](https://github.com/vishnu-k-dev/crm-nexus)

---

## What We'd Do Differently

1. **Tune the hybrid HNSW + graph pipeline** — vector seed first, then traversal. We implemented it but didn't have time to optimize.
2. **More eval questions** — 36 proves the pattern, 100 would tighten confidence intervals.
3. **TigerGraph Cloud over local Docker** — eliminates infra debugging entirely.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Graph DB | TigerGraph Community Edition (Docker) |
| Queries | GSQL multi-hop + REST++ API |
| Embeddings | Jina AI jina-embeddings-v2-base-en (768-dim) |
| LLM | Llama 3.3 70B via Groq |
| Judge | Llama 4 Scout 17B via Groq |
| API | Fastify + Node 20 + TypeScript |
| Dashboard | Vanilla HTML/CSS/JS on Vercel |

---

*Built for the TigerGraph GraphRAG Inference Hackathon 2026 — Team BroCode (Vishnu K & Revanth M)*

*Tags: `#TigerGraph` `#GraphRAG` `#GraphDatabase` `#LLM` `#Hackathon` `#RAG`*
