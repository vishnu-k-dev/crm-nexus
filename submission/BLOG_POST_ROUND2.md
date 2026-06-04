# Why Your RAG Pipeline Can't Answer Relationship Questions (And How We Fixed It)

**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**

---

We ran three retrieval pipelines on 90 CRM questions — same LLM, same data, only retrieval changed.

**GraphRAG: 96.7% accuracy, 1,483 avg prompt tokens.**
**BasicRAG: 71.1% accuracy, 10,867 avg prompt tokens.**

86% fewer tokens. 25 percentage points higher accuracy. 17.5% faster.

The gap isn't tuning. It's geometry. Here's the full technical story.

---

## The Problem: CRM Data Is a Graph, Not a Document Store

Standard RAG treats your knowledge base as a pile of text chunks ranked by embedding similarity. That works for factual lookups: *"What is the SLA for Gold tier vendors?"* — one chunk, one answer.

It breaks completely on relationship questions.

Ask: *"Which customers were impacted by OUTAGE-001 through their shared vendor and region?"*

There is no document that contains that answer. The answer is a traversal:

```
OUTAGE-001 → REGION-FRANKFURT → VEND-01 → [250 customers]
```

Flat cosine similarity finds chunks that *mention* OUTAGE-001. It has no mechanism to follow that edge to the region, then follow another edge to the vendor, then aggregate all customers on that vendor. That's not a retrieval quality problem — it's a structural mismatch between the retrieval method and the shape of the data.

A CRM is fundamentally a graph. Customers depend on vendors. Vendors operate in regions. Outages hit vendors in regions. Tickets escalate from customers. If your retrieval doesn't model those edges, you're leaving most of the signal on the floor.

**The honest test we ran:** we gave BasicRAG a well-resourced flat-vector index built from the same CRM corpus — every eval entity's documents guaranteed to be present. BasicRAG still capped at 71.1%. The failures aren't a coverage problem. They're questions where the answer requires traversing edges that flat search cannot follow.

---

## The Dataset: 158M Tokens of Interconnected CRM Data

We built a synthetic CRM knowledge base with the following entity types, all interlinked:

| Entity | Count | Key Relationships |
|---|---|---|
| Customers | 250 | → Vendors (primary + secondary), → Regions, → Tickets, → Projects |
| Vendors | 50 | → Outages, → Regions, → Customers |
| Outages | 100 | → Vendors, → Regions, → Tickets |
| Regions | 10 | → Customers, → Vendors, → Outages |
| Employees | 200 | → Customers (AM + CSM), → Tickets |
| Tickets | 3,000+ | → Customers, → Outages, → Employees |
| Compliance cases | — | → Customers, → Regions |
| Projects | — | → Customers, → Regions |

Total: **158.5M tokens across 100,820 documents**, embedded into **577,175 vector chunks** with TigerGraph's native HNSW index. Token count verified via Gemini `count_tokens` API — **1.58× the hackathon's 100M minimum.**

Every relationship is a traversable edge in TigerGraph. Not metadata. Not a filter. An edge.

---

## The TigerGraph Schema

The schema maps directly to the CRM domain. Vertex types:

```gsql
CREATE VERTEX Customer (PRIMARY_ID id STRING, name STRING,
  industry STRING, segment STRING, arr FLOAT, health_score INT,
  renewal_date STRING)

CREATE VERTEX Vendor (PRIMARY_ID id STRING, name STRING,
  category STRING, sla_tier STRING, region_affinity STRING)

CREATE VERTEX Outage (PRIMARY_ID id STRING, severity STRING,
  duration_hours INT, affected_systems STRING, root_cause STRING)

CREATE VERTEX Region (PRIMARY_ID id STRING, name STRING,
  availability_zone STRING, data_center STRING)

CREATE VERTEX Document (PRIMARY_ID doc_id STRING,
  content STRING, source_type STRING)
```

Edge types encode the relationships:

```gsql
CREATE DIRECTED EDGE depends_on (FROM Customer, TO Vendor)
CREATE DIRECTED EDGE experienced (FROM Vendor, TO Outage)
CREATE DIRECTED EDGE located_in (FROM Customer, TO Region)
CREATE DIRECTED EDGE operates_in (FROM Vendor, TO Region)
CREATE UNDIRECTED EDGE has_document (FROM Customer | Vendor |
  Outage | Region, TO Document)
```

The HNSW vector index sits on the `Document` vertex — 768-dimensional embeddings via `gemini-embedding-001`. Retrieval seeds on documents, then traverses up to the owning entity and out across its edges.

---

## The Retrieval Pipeline: Two-Phase Graph Traversal

Every incoming question goes through this flow:

### Phase 1 — Vector Seed

Embed the question with `gemini-embedding-001` (768-dim). Query TigerGraph's native HNSW index to find the top-k closest `Document` nodes. This gives us seed entities — the nodes in the graph most semantically related to the question.

```gsql
SELECT doc_id, cosine_similarity(embedding, @query_embedding) AS score
FROM Document
ORDER BY score DESC
LIMIT 5
```

This is not the final answer. It's the entry point.

### Phase 2 — Multi-Hop Traversal

From each seed entity, run a GSQL traversal across typed edges to collect connected context:

```gsql
CREATE QUERY getRelevantContext(STRING entity_id, INT k) {
  Start = {entity_id};

  -- Hop 1: direct neighbours
  L1 = SELECT t FROM Start:s -(ANY:e)-> :t LIMIT k;

  -- Hop 2: neighbours of neighbours
  L2 = SELECT t FROM L1:s -(ANY:e)-> :t LIMIT k;

  PRINT L1, L2;
}
```

For a question about OUTAGE-001: the seed finds the outage document. Hop 1 traverses to the vendor and region. Hop 2 traverses from the vendor to the customers and from the region to other affected entities. We collect only the subgraph connected to this question — not all 577K chunks.

The result is assembled into a prompt of ~1,483 tokens. Tight, relevant, and structurally complete.

### Phase 3 — Rerank + Generate

The retrieved chunks are reranked for relevance (Groq-based reranker, parallel across chunks). The top chunks go to Gemini 2.5 Flash for generation. Total pipeline: ~7.5s average.

---

## The Evaluation: How We Made Sure We Weren't Grading Our Own Homework

Three deliberate choices to keep the benchmark honest:

**1. Independent judge model.** Groq Llama 3.1 8B Instant assigns PASS/FAIL against reference answers. Different model family from the generator (Gemini) — eliminates self-scoring bias. It never sees which pipeline generated which answer.

**2. Same LLM for all three pipelines.** Gemini 2.5 Flash generates every answer — LLM-Only, BasicRAG, and GraphRAG. The only variable is what retrieval hands it. Any accuracy difference is retrieval quality, not model quality.

**3. Canonical BERTScore.** HuggingFace `bert_score` library, `roberta-large`, `rescale_with_baseline=True` — exactly the official rubric settings:

```python
from bert_score import score
P, R, F1 = score(
    candidates,
    references,
    model_type="roberta-large",
    lang="en",
    rescale_with_baseline=True,
    verbose=False
)
```

Results:

| Metric | GraphRAG | BasicRAG | LLM-Only |
|---|---|---|---|
| LLM-judge accuracy | **96.7% (87/90)** | 71.1% (64/90) | 3.3% (3/90) |
| BERTScore F1 (rescaled) | **0.5987** ✅ | 0.4539 | 0.0885 |
| BERTScore F1 (raw) | **0.9323** ✅ | 0.9078 | 0.8462 |
| Avg prompt tokens | **1,483** | 10,867 | 14 |
| Avg latency | **7.5s** | 9.1s | 2.0s |

GraphRAG clears both BERTScore bonus bars: ≥0.55 rescaled and ≥0.88 raw.

---

## The 3 Honest Misses

87/90, not 90/90. The 3 failures are worth explaining because they reveal exactly where graph RAG still has headroom.

All three are **hard multi-hop aggregation** questions. Example:

> *"How many projects in REGION-FRANKFURT were impacted by OUTAGE-001?"*

This requires: find OUTAGE-001 → traverse to REGION-FRANKFURT → filter projects in that region → count only those linked to OUTAGE-001. It's a multi-hop path with a join filter and an aggregation at the end.

Our current GSQL traversal does depth-first hop expansion with a depth limit. It collects the connected subgraph but doesn't express the join condition explicitly — so the LLM receives the right raw data but has to do more of the aggregation inference itself, which it sometimes gets wrong.

The fix is query-type-aware GSQL — writing a specific traversal for aggregation patterns rather than the general-purpose hop expansion we use now. That's on the roadmap.

---

## What We Learned About TigerGraph (The Real Story)

**HNSW + GSQL in one engine is the actual differentiator.** Every competitor approach we considered required two systems — a vector DB for similarity search plus a graph DB for traversal. TigerGraph does both natively. That's not a marketing claim — it's what made the two-phase retrieval pipeline practical to build.

**GSQL accumulators take time to click, then become powerful.** `SumAccum`, `SetAccum`, `MapAccum` — they're not SQL aggregations, they're accumulations during traversal. Once you stop trying to write them like SQL and start thinking "what do I accumulate as I walk the graph," multi-hop aggregation queries become natural.

**Community Edition is genuinely production-capable.** We ran 100,820 documents and 577K HNSW-indexed chunks without hitting any CE limits. The native vector index handled all retrieval. No external vector DB. No managed cloud. One Docker container.

**The infrastructure failure we had — and what it taught us.** An unclean container shutdown mid-embedding corrupted the gstore once. Lost a full rebuild. The lesson: snapshot `gstore` immediately after embedding completes, before running evaluation. We built a self-healing watcher script and a restore procedure. These are in the repo.

**What we'd do with more time:**
- Query-type-aware GSQL (specific traversals for aggregation vs lookup vs comparison)
- Adaptive hop depth based on query complexity classification
- 200+ eval questions to tighten confidence intervals
- Community Detection pass to identify vendor risk clusters before query time

---

## The Structural Takeaway

Flat similarity does one thing well: it finds text that looks like your query. For a document corpus with no internal relationships, that's the right tool.

For data where the answer lives *between* entities — in the edges — you need retrieval that can follow those edges. Not because graph RAG is newer or more complex. Because the structure of the retrieval needs to match the structure of the data.

**When to use flat RAG:** document QA, knowledge bases with independent facts, text that is self-contained per chunk.

**When to use graph RAG:** any domain where entities have typed relationships — CRM, supply chain, security incident graphs, financial networks, healthcare. If your question contains "through", "via", "related to", "impacted by", "depending on" — it's a traversal question, not a similarity question.

---

## Stack

| Layer | Technology |
|---|---|
| Graph DB | TigerGraph Community Edition 4.2 (Docker) |
| Schema + Queries | GSQL multi-hop traversal + accumulators |
| Vector Index | TigerGraph native HNSW (built-in, no external vector DB) |
| Embeddings | Google `gemini-embedding-001` (768-dim) |
| LLM (all 3 pipelines) | Gemini 2.5 Flash |
| Judge | Groq Llama 3.1 8B Instant |
| Semantic eval | HuggingFace `bert_score` (roberta-large) |
| API | Fastify + Node 20 + TypeScript |
| Dashboard | Vercel — crm-nexus-team-brocode.vercel.app |

**GitHub:** github.com/vishnu-k-dev/crm-nexus
**Live dashboard:** crm-nexus-team-brocode.vercel.app

Built for the **TigerGraph GraphRAG Inference Hackathon 2026** — Team BroCode

---

*#TigerGraph #GraphRAG #GraphDatabase #LLM #RAG #GSQL #VectorSearch*
