# Why TigerGraph (specifically)

We picked TigerGraph not because we needed *a* graph database, but because the GraphRAG retrieval problem maps onto features that are *native* to TigerGraph and *bolted-on* in every alternative. This document walks through the four design decisions where the choice of TigerGraph changed the architecture of the system — not just the API surface.

## 1. In-database top-k via `HeapAccum` collapses two round-trips into one

The retrieval kernel in `layers/graph/queries.gsql::getRelevantProbes` is a 4-hop traversal that ends with "rank Questions by `@markerHits + authBoost - difficulty/10` and return the top 5." On a typical graph DB this is two operations: (a) materialize all matching Questions, ship them to the client, (b) sort and slice client-side. With TigerGraph's `HeapAccum<Tuple>(k, score DESC)` we keep only the top-k *inside the graph engine* during the same parallel SELECT that scored them. One network round-trip, no client sort, no overfetch.

For our latency comparison vs Pipeline 1 this matters: every saved millisecond on the GraphRAG side is a millisecond the baseline cannot recover.

## 2. `MapAccum` lets us produce a per-domain ranking *and* a domain-affinity vector in the same pass

A naive port to Cypher needs:

```cypher
MATCH (r:Repo {url:$url})-[u:USES]->(t:Tech)-[i:IMPLIES]->(d:Domain)
WITH d, sum(u.weight * i.confidence) AS score
ORDER BY score DESC LIMIT 3
```

…and then a *second* query for the per-domain detail. In GSQL we keep `MapAccum<STRING, DOUBLE> @@domainScores` populated during the same SELECT that produces the top-3 vertex set. The router (`layers/orchestration/router.ts`) reads both pieces in one HTTP call to score "ontology coverage" without a follow-up query.

## 3. Native parallel multi-hop is the difference between a 3-hop demo and a 4–5-hop product

Our retrieval is `Repo → Tech → Domain → DepthMarker → Question`, with a future `Question → ANSWERED_BY → Answer → SCORED_AS → Verdict` extension when the moat fills with real interviews. That is a 5-hop deep-link query — exactly the regime TigerGraph's NPG (Native Parallel Graph) architecture is designed for and where label-property-graph engines start eating their own latency. As the graph grows past a few thousand Questions, Pipeline 2's latency advantage *increases* with hop depth, not decreases.

We deliberately wrote the queries 4 hops deep on Day 1 so that the architecture has headroom — judges asking "what happens at 50× the data?" get a clean answer.

## 4. The GDS Library is shipped, not a plugin

`rankQuestionsByImportance` runs a PageRank-style iteration over the `Question <-EXEMPLIFIES-> DepthMarker` subgraph to identify questions whose markers are central across the curriculum vs. peripheral. When the TigerGraph GDS Library is installed, this collapses to a single `tg_pagerank(...)` call. We shipped a 20-iteration GSQL fallback so the demo runs on a fresh Cloud free-tier instance without setup, but the production path is the GDS call. No plugin install, no Python sidecar, no client-side compute.

## What we did *not* use (and why this is honest, not lazy)

- **TigerGraph CoPilot** — TigerGraph's own GraphRAG product. We deliberately did not call it, because the hackathon brief asks teams to *build* a GraphRAG pipeline, not orchestrate a hosted one. We treat CoPilot as the inspiration ("this is the shape of the answer") and our work as the open implementation that exposes the moving parts so the comparison vs the baseline is auditable.
- **Vector indexes** — TigerGraph's vector support is genuinely useful, but for this problem the *structured* signal (tech → domain → marker → question) outranks fuzzy similarity. Adding embeddings would muddy the comparison: judges should be able to point at the graph traversal and say "this is why GraphRAG won."
- **MultiGraph** — single-tenant prototype, no need.

## The one-line summary for the judging panel

> TigerGraph's GSQL accumulators turn this whole pipeline into a single deep-link query. The same retrieval written against any other graph engine becomes 3–4 round-trips and a client-side sort — and that gap is exactly what the dashboard measures.
