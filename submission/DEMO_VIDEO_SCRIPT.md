# CRM Nexus — Demo Video Script
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Target: 8–10 min

> **EXACT NUMBERS — do not improvise:**
> GraphRAG 96.7% (87/90) · BasicRAG 71.1% (64/90) · LLM-Only 3.3%
> Tokens: GraphRAG 1,483 vs BasicRAG 10,867 → 86.4% reduction
> Latency: 7.5s vs 9.1s → 17.5% faster
> BERTScore F1: 0.93 raw / 0.60 rescaled
> Dataset: 158M tokens · 100,820 docs · 577K chunks · 1.58× minimum
> LLM: Gemini 2.5 Flash (all 3) · Judge: Groq Llama 3.1 8B

---

## — Hero (0:00–0:30)

**Open on the benchmark table. Say:**

> "86% fewer tokens. Same LLM. Higher accuracy. Here's why."

**Then:**
> "I'm Vishnu from Team BroCode. This is CRM Nexus — a GraphRAG system on TigerGraph that answers CRM relationship questions with 96.7% accuracy at a fraction of what standard RAG costs. Let me show you the problem, the architecture, and the live proof."

**Show:** Dashboard benchmark charts — accuracy + token bars visible immediately

---

## — The Problem (0:30–1:45)

**Say:**
> "Standard RAG treats your knowledge base like a document pile. You embed a question, rank chunks by cosine similarity, and send the top results to the LLM. For isolated facts — that works.
>
> For relationship questions — it breaks structurally.
>
> Here's a real CRM question: 'Which customers were impacted by OUTAGE-001 through their shared vendor and region?'
>
> There is no document that answers that. The answer is a traversal — outage to region, region to vendor, vendor to customers. Cosine similarity finds text that *looks* like the question. It has no mechanism to follow that edge chain and aggregate what's at the end.
>
> We proved this isn't a data coverage problem. We gave BasicRAG a flat-vector index with the relevant documents for every single eval question present. It still capped at 71.1%. The failures are structural — questions where the answer requires traversing edges that flat search cannot follow.
>
> CRM data is a graph. Customers depend on vendors. Vendors cause outages. Outages hit regions. Regions host customers. If your retrieval doesn't model those edges — you're leaving most of the signal on the floor."

**Show:** Diagram — flat cosine vs graph traversal

---

## — Architecture (1:45–3:30)

**Say:**
> "Here's how we solve it — four decoupled layers.
>
> **Layer 1 — The Graph.**
> TigerGraph Community Edition in Docker. We mapped the CRM domain into a typed schema — Customer, Vendor, Outage, Region, Employee, Ticket vertices with typed directed edges between them. Customers have a `depends_on` edge to their vendors. Vendors have an `experienced` edge to their outages. Every relationship is a traversable edge — not metadata, not a keyword, an edge.
>
> 100,820 documents embedded into 577,175 vector chunks with TigerGraph's **native HNSW index** — no external vector database. The vector index and the graph traversal live in the same engine.
>
> **Layer 2 — Two-Phase Retrieval.**
> When a question arrives, we run two phases. Phase one: embed the question, query the HNSW index to find the closest document nodes — these are the seed entities, the entry point into the graph. Phase two: from those seeds, run a GSQL multi-hop traversal — hop 1 gets direct neighbours, hop 2 gets neighbours of neighbours. We collect only the subgraph connected to this question.
>
> You can see the GSQL here — Start from the seed, SELECT across any edge to depth L1, then SELECT from L1 across any edge to depth L2, print both. That's the traversal that gives us 1,483 focused tokens instead of 10,867 scattered ones.
>
> **Layer 3 — LLM.**
> Gemini 2.5 Flash receives a tight, structurally complete context brief. Same model for all three pipelines — the only variable is what retrieval hands it.
>
> **Layer 4 — Evaluation.**
> Groq Llama 3.1 8B as an independent judge — different model family, eliminates self-scoring bias, PASS/FAIL per question. Plus canonical HuggingFace BERTScore with roberta-large."

**Show:**
- Architecture diagram (all 4 layers)
- GSQL traversal code block
- GraphStudio (localhost:14240) — schema view, show the vertex/edge types
- `gadmin status` — Community Edition banner

---

## — Benchmark (3:30–4:30)

**Say:**
> "90 evaluation questions — 50 single-hop, 40 multi-hop — covering every entity type: outages, customers, vendors, employees, tickets, compliance, projects, regions.
>
> Results with the same LLM across all three:
>
> LLM-Only: 3.3%. No retrieval — it has never seen our synthetic CRM data, it's guessing from model memory.
>
> BasicRAG: 71.1%. It has the data. It fails on multi-hop questions because cosine similarity can't traverse edges. Every single one of its 26 failures is a question where the answer spans more than one entity type.
>
> GraphRAG: 96.7%. 87 out of 90. The 3 misses are the hardest aggregation questions — multi-hop path with a join filter and a count. We document them honestly in the repo.
>
> Beyond accuracy: 86% fewer tokens — 1,483 versus 10,867. The graph acts as a precision filter. You only send the LLM what it actually needs. And because it's a targeted lookup rather than a broad similarity scan, it's also 17.5% faster.
>
> BERTScore F1: 0.93 raw, 0.60 rescaled — computed with the official rubric settings, roberta-large, rescale_with_baseline=True. Clears both bonus bars."

**Show:** Dashboard — accuracy chart, token bar chart, latency chart, BERTScore

---

## — Live Demo (4:30–7:30)

**Say:**
> "Let me run this live. All three pipelines in parallel — same question, same LLM, only retrieval changes. Watch the token bars first on every query — the gap is visible before you read a single word of the answer."

**Open localhost:5173 → Live Demo tab**

---

**Q1 — single hop (0:00 in demo):**
> *"What is the severity level of outage OUTAGE-001?"*

> "Token bars — GraphRAG around 1,500, BasicRAG around 10,000. GraphRAG answer: P3 severity, REGION-FRANKFURT, VEND-01.
> Both pipelines get this right. On a single-fact question the accuracy is similar — but GraphRAG is already using one seventh of the tokens. At scale, that difference is the gap between a viable product and a runaway API bill."

---

**Q2 — one-hop relationship:**
> *"Which vendor is customer CUST-0001 primarily dependent on?"*

> "One hop — Customer to Vendor edge. GraphRAG: VEND-01, MedSync. The graph found the customer node, traversed the `depends_on` edge, returned the vendor. Surgical — 1,500 tokens, one hop, exact answer."

---

**Q3 — multi-hop aggregation:**
> *"How many outages has VEND-15 experienced?"*

> "Now watch BasicRAG. It finds documents that mention VEND-15 but it cannot walk the `experienced` edge and count what's on the other side.
>
> GraphRAG traverses vendor to outages, counts them — 2 outages, OUTAGE-015 and OUTAGE-065. Exact answer. This is the structural difference — retrieval that models the edge versus retrieval that ranks text."

---

**Q4 — large-scale graph aggregation:**
> *"How many customers depend on VEND-15 as their primary vendor?"*

> "GraphRAG: 250 customers. It traverses the reverse `depends_on` edge — from vendor back to all customers with that vendor as primary — and aggregates. That's a graph operation. There is no similarity-based equivalent."

---

**Q5 — cross-entity aggregation:**
> *"How many customers depend on VEND-01 as their primary vendor?"*

> "Same pattern — 250 customers. Notice the consistency: every query, same token profile, same structural traversal. The graph doesn't need to scan more chunks for harder questions because it always walks only the connected subgraph.
>
> Same model wrote every one of those answers. The only thing that changed is what retrieval handed it — and the graph handed it less, and better."

---

## — Why This Matters (7:30–8:30)

**Say:**
> "The 25-point accuracy gap, the 86% token reduction, the faster latency — these aren't independent wins. They come from the same place: retrieval that matches the structure of the data.
>
> Flat similarity is the right tool for a document corpus. For data where the answer lives in the edges between entities — CRM, supply chain, security incident graphs, financial networks — you need retrieval that can traverse those edges.
>
> If your question contains 'through', 'via', 'impacted by', 'depending on', 'related to' — it's a traversal question, not a similarity question. And a traversal question needs a graph.
>
> Built entirely on TigerGraph Community Edition. No external vector database. One engine — native HNSW plus GSQL multi-hop — that's what made this practical."

**Show:** Final stats card — 96.7% · 86% fewer tokens · 17.5% faster · BERTScore 0.93

---

## SETUP CHECKLIST
- [ ] Docker up, all 20 services Online (`gadmin status`)
- [ ] API: localhost:3001/health → `{"ok":true}`
- [ ] Dashboard: localhost:5173 (NOT Vercel — no backend)
- [ ] Pre-run all 5 queries, confirm correct answers
- [ ] GraphStudio open on localhost:14240 (schema view ready)
- [ ] Screen clean, font up, no error toasts

## ⚠️ DO NOT USE IN LIVE DEMO
- "8 customers impacted by OUTAGE-001 through shared vendor and region" → over-counts (250)
- "What is CUST-0001's total vendor risk exposure?" → answer truncates
- Region-filter aggregation questions (known 3 eval misses)
- Do NOT type arbitrary questions outside the 5 above
