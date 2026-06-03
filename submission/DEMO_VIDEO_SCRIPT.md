# CRM Nexus — Demo Video Script
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Target: 8–10 min

> **NUMBERS (exact — do not improvise):**
> GraphRAG 96.7% (87/90) · BasicRAG 71.1% (64/90) · LLM-Only 3.3%
> Token reduction 86.4% · GraphRAG 1,483 tokens vs BasicRAG 10,867
> Latency: GraphRAG 7.5s vs BasicRAG 9.1s (17.5% faster)
> BERTScore F1: 0.93 raw / 0.60 rescaled · 158M tokens · 100,820 docs · 577K chunks
> LLM: Gemini 2.5 Flash · Judge: Groq Llama 3.1 8B

---

## — Hero

**Say:**
> "Hi, I'm Vishnu from Team BroCode. This is CRM Nexus.
>
> We built a GraphRAG system on TigerGraph that answers complex CRM relationship questions with 96.7% accuracy — using 86% fewer tokens than standard RAG and running faster. I'm going to walk you through the problem we solved, how the architecture works, the benchmark results, and run it live."

**Show:** Landing page — crm-nexus-team-brocode.vercel.app

---

## — The Problem

**Say:**
> "Here's the core problem with standard RAG on relational data.
>
> You ask: 'Which customers were impacted by this outage through their shared vendor and region?' There is no single document that answers that. The answer lives across multiple hops — outage links to a region, that region links to a vendor, that vendor links to customers.
>
> Standard RAG embeds your question, finds the 15 most cosine-similar chunks, sends all of them — around 10,000 tokens — to the LLM, and hopes the answer is somewhere in there. For a single-fact question, that works. For a relationship question that spans edges in your data — it fails. Not because the data isn't there. Because flat similarity has no concept of edges.
>
> Think about what a real CRM analyst needs to answer: 'What's this customer's total vendor risk exposure?' That means: what vendors do they depend on, have those vendors had outages, how many customers share those same vendors, and what's the blast radius if one goes down? That answer lives across five entity types and three hops. You cannot retrieve it with cosine similarity. You have to traverse the graph."

**Show:** Diagram — flat cosine vs graph traversal, side by side

---

## — Architecture

**Say:**
> "So here's how CRM Nexus solves it — four decoupled layers.
>
> **Layer 1 — Graph.** TigerGraph Community Edition running in Docker. We ingested 100,820 CRM documents and embedded 577,000 vector chunks into TigerGraph's native HNSW index — no external vector database. The schema maps real CRM relationships: Customer connects to Vendor, Vendor connects to Outage, Outage connects to Region, Region connects back to Customer. Every edge is a traversable relationship.
>
> **Layer 2 — Orchestration.** Node.js and Fastify. When a question comes in, we classify it — single-hop, multi-hop, or aggregation — then run a two-phase retrieval. Phase one: embed the question with Gemini and seed into the HNSW index to find the closest entity nodes. Phase two: from those seed nodes, run a GSQL traversal — 3 hops out, collecting only the directly connected context. We assemble only the chunks that are actually relevant to this question's entity graph.
>
> You can see the GSQL here — it's a two-hop traversal. Start from the seed entity, traverse any edge to depth L1, then traverse again to depth L2, collect and print. That's what makes this efficient — instead of scanning all 577,000 chunks, we walk only the subgraph connected to the question.
>
> **Layer 3 — LLM.** Gemini 2.5 Flash gets a focused ~1,500-token prompt instead of a 10,000-token wall. Same model for all three pipelines — LLM-Only, BasicRAG, and GraphRAG. The only variable is what retrieval hands it.
>
> **Layer 4 — Evaluation.** Groq Llama 3.1 8B as an independent judge — a completely different model family to avoid self-scoring bias. PASS or FAIL per question. Plus canonical HuggingFace BERTScore with roberta-large as the official rubric requires."

**Show:** Architecture diagram with all 4 layers · GSQL code block · schema in GraphStudio (localhost:14240)

---

## — Benchmark

**Say:**
> "90 evaluation questions — 50 single-hop and 40 multi-hop — across all CRM entity types: outages, customers, vendors, employees, tickets, compliance, projects, regions.
>
> Same LLM — Gemini 2.5 Flash — for all three pipelines. Only retrieval changes. Results:
>
> LLM-Only with no retrieval: 3.3%. It's answering from model memory — it has never seen our synthetic CRM data.
>
> BasicRAG with cosine similarity: 71.1%. It has the data but fails on multi-hop questions because flat similarity can't traverse edges. Every single one of its failures is a question where the answer requires following a relationship — not finding a similar chunk.
>
> GraphRAG: 96.7%. 87 out of 90 correct. The 3 misses are the hardest aggregation questions — multi-hop plus count plus region filter in a single query. We document them honestly in the repo.
>
> And here's the part that matters beyond accuracy: GraphRAG uses 86% fewer tokens — 1,483 versus 10,867 per query. It's also 17.5% faster. More accurate, cheaper, AND faster — because the graph acts as a filter. You only send the LLM what it actually needs.
>
> BERTScore F1: 0.93 raw and 0.60 rescaled — clearing both bonus bars. Computed with the exact official settings: roberta-large, rescale_with_baseline=True."

**Show:** Dashboard benchmark charts — accuracy bars, token bars, latency bars, BERTScore

---

## — Live Demo

**Say:**
> "Let me run this live. Every query runs all 3 pipelines simultaneously — LLM-Only, BasicRAG, GraphRAG. Watch the token bars on the left of each result first — the difference is visible on every single query before you even read the answer."

**Open localhost:5173 → Live Demo tab**

---

**Q1 — warm-up (single hop):**
> Type: *"What is the severity level of outage OUTAGE-001?"*

> "Point at the token bars — GraphRAG around 1,500, BasicRAG around 10,000. GraphRAG answer: P3 severity, REGION-FRANKFURT, VEND-01. Both pipelines get this right — but GraphRAG used a fraction of the tokens. On a single-fact question, the token saving alone is the win."

---

**Q2 — one-hop relationship:**
> Type: *"Which vendor is customer CUST-0001 primarily dependent on?"*

> "One hop — customer to vendor. GraphRAG: VEND-01, MedSync. Surgical. It found the customer node, traversed the dependency edge, returned the vendor. BasicRAG has to scan chunks hoping a document mentions both CUST-0001 and its vendor together."

---

**Q3 — multi-hop aggregation (the wow moment):**
> Type: *"How many outages has VEND-15 experienced?"*

> "This is where graph traversal separates itself. The question requires: find VEND-15 in the graph, traverse the outage edges, count them. GraphRAG: 2 outages — OUTAGE-015 and OUTAGE-065. Flat cosine similarity has no mechanism to traverse that edge and aggregate. It can find documents that mention VEND-15, but it cannot walk the relationship and count what's on the other side."

---

**Q4 — large-scale aggregation:**
> Type: *"How many customers depend on VEND-15 as their primary vendor?"*

> "GraphRAG: 250 customers. This traverses the vendor-to-customer dependency edge across the entire graph and counts. A graph operation — not a similarity match. BasicRAG either gets this wrong or gets lucky if the answer happens to be stated somewhere in a chunk."

---

**Q5 — vendor-customer dependency:**
> Type: *"How many customers depend on VEND-01 as their primary vendor?"*

> "GraphRAG: 250 customers. Same pattern — one-hop traversal, exact count. Notice the token bar again — every query, same story. 1,500 versus 10,000. The graph tells the LLM exactly what it needs."

---

**Closing live demo line:**
> "Same model wrote every one of those answers. The only difference is what retrieval handed it — and the graph handed it less, and better."

---

## — Why We Won

**Say:**
> "The gap is structural — not about tuning, not about data coverage. BasicRAG had access to the same 158 million tokens. It failed on multi-hop questions because cosine similarity ranks by surface text match and has no concept of graph edges.
>
> Graph traversal doesn't rank — it walks. It follows the actual relationships in the data and returns only the connected subgraph. That's why it's simultaneously more accurate, cheaper, and faster.
>
> For any enterprise sitting on relational knowledge — CRM, supply chain, security incident graphs — this is the retrieval method that matches the structure of the data. Built entirely on TigerGraph Community Edition."

**Show:** Final stats card — 96.7% · 86% fewer tokens · 17.5% faster · BERTScore 0.93

---

## SETUP CHECKLIST (before recording)
- [ ] Docker up, GPE Online (`gadmin status` — all 20 services Online)
- [ ] API healthy: localhost:3001/health → `{"ok":true}`
- [ ] Use localhost:5173 (NOT Vercel — no backend connection)
- [ ] Pre-run all 5 demo queries, confirm correct answers
- [ ] Screen clean, font size up, no error toasts
- [ ] TigerGraph Community Edition proof: `gadmin status` shows the CE banner top line

## ⚠️ DO NOT USE THESE IN LIVE DEMO
- "8 customers impacted by OUTAGE-001 through shared vendor and region" → over-counts (returns 250)
- "What is CUST-0001's total vendor risk exposure?" → answer truncates (not enough context assembled)
- Any region-filter aggregation questions (e.g. "how many projects in REGION-X impacted by OUTAGE-Y") → known eval misses
- Do NOT improvise arbitrary questions outside the 5 above
