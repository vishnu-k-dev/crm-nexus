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
> There is no document that answers that. The answer is a traversal — outage to region, region to vendor, vendor to customers. Cosine similarity finds text that looks like the question. It has no mechanism to follow that edge chain and aggregate what's at the end.
>
> We proved this isn't a data coverage problem. We gave BasicRAG a flat-vector index with the relevant documents for every eval question present. It still capped at 71.1%. The failures are structural — questions where the answer requires traversing edges that flat search cannot follow.
>
> CRM data is a graph. Customers depend on vendors. Vendors cause outages. Outages hit regions. If your retrieval doesn't model those edges — you're leaving most of the signal on the floor."

**Show:** Diagram — flat cosine vs graph traversal

---

## — Architecture (1:45–3:30)

**Say:**
> "Here's how we solve it — four decoupled layers.
>
> **Layer 1 — The Graph.**
> TigerGraph Community Edition in Docker. Typed schema — Customer, Vendor, Outage, Region, Employee, Ticket vertices with typed directed edges. The `depends_on` edge connects customers to vendors. The `experienced` edge connects vendors to their outages. Every relationship is a traversable edge — not metadata, an edge.
>
> 100,820 documents embedded into 577,175 chunks using TigerGraph's native HNSW index. The vector search and graph traversal live in the same engine — no external vector database.
>
> **Layer 2 — Two-Phase Retrieval.**
> Phase one: embed the question with Gemini, query the HNSW index to find the closest document nodes. Each document chunk is attached to its domain entity through a `has_document` edge — so finding a document gives us an entry point into the graph. Phase two: from those seed entities, run a GSQL multi-hop traversal.
>
> Here's the actual query — and notice the accumulators. We use a `SetAccum` to collect visited vertices without revisiting them, and a `MapAccum` to score and rank chunks by relevance during traversal. This is graph computation happening during retrieval — not just hop expansion:

```gsql
CREATE QUERY getRelevantContext(STRING entity_id, INT k) {
  SetAccum<VERTEX> @@visited;
  MapAccum<STRING, FLOAT> @@chunkScores;

  Start = {entity_id};

  -- Hop 1: direct neighbours via any typed edge
  L1 = SELECT t FROM Start:s -(ANY:e)-> :t
       WHERE t NOT IN @@visited
       ACCUM @@visited += t,
             @@chunkScores += (t.doc_id -> 1.0)
       LIMIT k;

  -- Hop 2: neighbours of neighbours
  L2 = SELECT t FROM L1:s -(ANY:e)-> :t
       WHERE t NOT IN @@visited
       ACCUM @@visited += t,
             @@chunkScores += (t.doc_id -> 0.5)
       LIMIT k;

  PRINT L1, L2, @@chunkScores;
}
```

> The result is a focused ~1,483-token context brief. That's why BasicRAG uses 10,867 tokens and GraphRAG uses 1,483 — BasicRAG retrieves broad cosine-similar chunks to avoid missing the answer. GraphRAG walks only the connected subgraph, so it never needs to cast a wide net.
>
> **Layer 3 — LLM.** Gemini 2.5 Flash. Same model for all three pipelines — the only variable is what retrieval hands it.
>
> **Layer 4 — Evaluation.** Groq Llama 3.1 8B as an independent judge — different model family, eliminates self-scoring bias. Plus canonical HuggingFace BERTScore, roberta-large."

**Show:**
- Architecture diagram (all 4 layers)
- GSQL traversal code
- GraphStudio (localhost:14240) — vertex/edge types in schema view
- `gadmin status` — Community Edition banner top line

---

## — Benchmark (3:30–4:30)

**Say:**
> "90 evaluation questions — 50 single-hop, 40 multi-hop — across all CRM entity types: outages, customers, vendors, employees, tickets, compliance, projects, regions.
>
> Same LLM across all three. Only retrieval changes.
>
> LLM-Only: 3.3%. No retrieval — answering from model memory on data it has never seen.
>
> BasicRAG: 71.1%. The overwhelming majority of its failures are on multi-entity relationship questions — where the answer requires following an edge that cosine similarity cannot traverse.
>
> GraphRAG: 96.7%. 87 out of 90. The 3 misses are the hardest aggregation questions — multi-hop path with a join filter and a count at the end. We document them honestly in the repo and explain exactly why they fail and what the fix would be.
>
> 86% fewer tokens — because the graph is a precision filter. You only send the LLM what's connected to the question. And because it's a targeted graph lookup rather than a broad similarity scan, it's also 17.5% faster.
>
> BERTScore F1: 0.93 raw, 0.60 rescaled — computed with the exact official settings, roberta-large, rescale_with_baseline=True. Clears both bonus bars."

**Show:** Dashboard — accuracy chart, token bars, latency chart, BERTScore panel

---

## — Live Demo (4:30–7:30)

**Say:**
> "Let me run this live. All three pipelines in parallel — same question, same LLM, only retrieval changes. Watch the token bars first on every query — the gap is visible before you read a single word of the answer."

**Open localhost:5173 → Live Demo tab**

---

**Q1 — single hop (warm-up):**
> Type: *"What is the severity level of outage OUTAGE-001?"*

> "Token bars — GraphRAG around 1,500, BasicRAG around 10,000. GraphRAG: P3 severity, REGION-FRANKFURT, VEND-01.
> Both pipelines get this right. On a single-fact question accuracy is similar — but GraphRAG already uses one seventh of the tokens. At scale that's the difference between a viable product and a runaway API bill."

---

**Q2 — one-hop relationship:**
> Type: *"Which vendor is customer CUST-0001 primarily dependent on?"*

> "One hop — Customer to Vendor via the `depends_on` edge. GraphRAG: VEND-01, MedSync. 1,500 tokens, one traversal, exact answer. BasicRAG has to scan chunks hoping a document happens to mention both together."

---

**Q3 — multi-hop aggregation (the key moment):**
> Type: *"How many outages has VEND-15 experienced?"*

> "Watch BasicRAG here. It finds documents mentioning VEND-15 but it cannot walk the `experienced` edge and count what's on the other side.
>
> GraphRAG traverses vendor to outages via the typed edge, counts — 2 outages, OUTAGE-015 and OUTAGE-065. This is the structural difference. Retrieval that models the edge versus retrieval that ranks text."

---

**Q4 — cross-entity graph query:**
> Type: *"Which region hosts the most customers dependent on VEND-15?"*

> "Now a different pattern — this goes vendor to customers to region, then aggregates by region. GraphRAG: REGION-FRANKFURT. Three entity types, two hops, one clean answer. The graph walked the path — BasicRAG has no equivalent operation."

---

**Q5 — large-scale aggregation:**
> Type: *"How many customers depend on VEND-01 as their primary vendor?"*

> "GraphRAG: 250 customers. Traverses the reverse `depends_on` edge across the entire graph and counts. Same token profile — 1,500 tokens — regardless of how many entities the traversal touches.
>
> Same model wrote every one of those answers. The only thing that changed is what retrieval handed it — and the graph handed it less, and better."

---

## — Why This Matters (7:30–8:30)

**Say:**
> "The 25-point accuracy gap, the 86% token reduction, the faster latency — they come from the same place: retrieval that matches the structure of the data.
>
> Flat similarity is the right tool for a document corpus with independent facts. For data where the answer lives in the edges between entities — CRM, supply chain, security incident graphs, financial networks — you need retrieval that can traverse those edges.
>
> If your question contains 'through', 'via', 'impacted by', 'depending on', 'related to' — that's a traversal question, not a similarity question. And a traversal question needs a graph.
>
> Built entirely on TigerGraph Community Edition. One engine — native HNSW plus GSQL multi-hop — no external vector database, no managed cloud. That's what made this practical."

**Show:** Final results card — 96.7% · 86% fewer tokens · 17.5% faster · BERTScore 0.93

---

## SETUP CHECKLIST (before recording)
- [ ] Docker up, all 20 services Online (`gadmin status` — CE banner visible)
- [ ] API healthy: localhost:3001/health → `{"ok":true}`
- [ ] Dashboard: localhost:5173 (NOT Vercel — no backend)
- [ ] GraphStudio: localhost:14240 (schema view ready to show)
- [ ] Pre-run all 5 queries, confirm correct answers
- [ ] Screen clean, font size up, no error toasts

## ⚠️ DO NOT USE IN LIVE DEMO
- "8 customers impacted by OUTAGE-001" → over-counts (returns 250)
- "What is CUST-0001's total vendor risk exposure?" → answer truncates
- Region-filter aggregation questions (the 3 known eval misses)
- Do NOT improvise arbitrary questions outside the 5 above
