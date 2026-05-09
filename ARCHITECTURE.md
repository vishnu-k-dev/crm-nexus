# AI Factory Architecture — TechProbe AI

The judging rubric calls for four cleanly separated layers. The directory tree is the documentation:

```
apps/api/src/layers/
├── graph/              ← Graph Layer
│   ├── schema.gsql            (vertex/edge DDL — TigerGraph DDL is here, not scattered)
│   ├── queries.gsql           (multi-hop retrieval: getRelevantProbes, graphStats)
│   ├── client.ts              (REST++ wrapper: ping, runQuery, upsert)
│   ├── seed.ts                (idempotent ontology bulk-load)
│   ├── extract/
│   │   ├── repoParser.ts          (GitHub API → entities)
│   │   ├── domainClassifier.ts    (Tech → Domain ontology)
│   │   └── depthMarkers.ts        (Domain → DepthMarker → Question seed)
│   └── index.ts               (public surface)
│
├── orchestration/      ← Inference Orchestration Layer
│   ├── router.ts              (decides: graph vs LLM-only vs blend)
│   ├── pipelines/
│   │   ├── baseline.ts            (control: prompt-stuff)
│   │   └── graphrag.ts            (treatment: 3-hop retrieve → compose → LLM)
│   └── index.ts
│
├── llm/                ← LLM Layer
│   ├── claude.ts              (gen=Haiku 4.5 with caching, judge=Sonnet 4.6)
│   └── index.ts
│
└── evaluation/         ← Evaluation Layer
    ├── judge.ts               (independent, blinded pairwise judge)
    ├── store/sqlite.ts        (bench_runs, bench_judgements, aggregates)
    └── index.ts
```

## Strict dependency rule (enforced by import paths)

```
              ┌──────── routes/ ─────────┐
              ▼                          ▼
        orchestration ───┬──→ graph
              │          └──→ llm
              ▼
         evaluation ─────────→ llm
```

- **graph** depends on no other layer.
- **llm** depends on no other layer.
- **orchestration** may import from graph and llm only.
- **evaluation** may import from llm only (it never traverses the graph; it judges outputs).
- **routes/** are the HTTP boundary; they call into orchestration + evaluation, never into graph or llm directly.

## How each rubric requirement maps

| Rubric line | Where it lives |
|-------------|---------------|
| "Graph Layer — TigerGraph handles entity extraction, relationships, and graph queries." | `layers/graph/` (schema + queries + extract + client) |
| "Inference Orchestration Layer — decides when to use graph, when to call the LLM, and how they work together." | `layers/orchestration/router.ts` (decide + route) |
| "LLM Layer — generates the final answer using the filtered context." | `layers/llm/claude.ts` (single client; same model called by both pipelines for fair compare) |
| "Evaluation Layer — runs the benchmarks and populates your comparison dashboard." | `layers/evaluation/` (Sonnet judge + SQLite store) |

## Why this matters for production

- **Swappable graph**: replace TigerGraph with another graph DB by changing only `layers/graph/client.ts`. Pipelines, LLM, and eval are untouched.
- **Swappable model**: change `layers/llm/claude.ts` to OpenAI/etc. without touching graph queries or eval.
- **Add a new pipeline (e.g., HybridRAG)**: drop a file in `layers/orchestration/pipelines/`, register it in `router.ts`. No changes to graph or eval.
- **Replace eval store with Postgres**: only `layers/evaluation/store/` changes; the dashboard contract (`aggregate()`) stays the same.

The four `index.ts` files act as the public surface of each layer; everything outside imports from those, not from internals.
