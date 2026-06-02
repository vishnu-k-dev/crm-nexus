# CRM Nexus — Benchmark Proof (Final, Verified)
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Run date: 2026-06-02 · Graph: rebuilt & stable (577,175 embedded chunks)

## Final results — 90 evaluation questions, fair comparison

| Metric | GraphRAG | BasicRAG | LLM-Only |
|---|---|---|---|
| **Accuracy (LLM-judge PASS)** | **87/90 = 96.7%** | 64/90 = 71.1% | 3/90 = 3.3% |
| **Semantic similarity F1** (Jina cosine, rescaled) | **0.865** | 0.754 | 0.564 |
| **Avg prompt tokens** | **1,483** | 10,867 | — |
| **Avg latency** | **7,495 ms** | 9,090 ms | — |

**Headline:** GraphRAG is simultaneously **more accurate** (96.7% vs 71.1%), **cheaper** (86.4% fewer prompt tokens), and **faster** (17.5% lower latency) than a flat-vector BasicRAG baseline — on the same data, with the same LLM.

## Methodology (fairness controls)
- **Same LLM for all three pipelines** — `gemini-2.5-flash` (only the retrieval layer differs, isolating retrieval quality).
- **Same 90 questions** — 50 single-hop + 40 multi-hop, covering outages, customers, vendors, employees, tickets, compliance, projects, regions.
- **Independent judge** — LLM-judge (Groq) assigns PASS/FAIL vs reference answers; not self-scored.
- **Fair BasicRAG index** — 2,000-chunk flat vector store (Jina embeddings) **guaranteed to contain every eval entity's documents** + an even corpus sample. BasicRAG was *not* starved of data — it had the relevant docs and still capped at 71.1%, proving the gap is a **retrieval-method** limitation (flat similarity cannot traverse relationships), not a coverage one.
- **Semantic F1** is sentence-embedding cosine similarity (Jina, rescaled with 0.60 baseline) used as a BERTScore proxy — *labeled accurately as semantic similarity, not canonical BERTScore.*

## GraphRAG's 3 misses (honest)
All three are hard multi-hop **aggregation** questions:
- q16 — CUST-1000 vendor + segment (compound)
- q51 — "how many customers exposed to OUTAGE-002 through VEND-02 in REGION-LONDON"
- q58 — "how many projects in REGION-FRANKFURT impacted by OUTAGE-001"

## Dataset
- CRM core: **~158.5M tokens** across **100,820 documents** → 577,175 embedded chunks in TigerGraph (HNSW vector index). **1.58× the 100M-token hackathon minimum.**
- Activity-log padding (would reach 255M) deliberately excluded — not needed; all 90 questions live in the CRM core.

## Raw data / reproducibility
- Final results JSON: `data/crm_eval_results.json` (per-question answers, judge verdicts, tokens, latency, semantic F1).
- Backups: `benchmark_88_90_backup_20260531/crm_eval_FINAL_fair_20260602.json`; graph snapshot `gstore_clean_20260602_134940.tgz` (host + OneDrive).
- Pipelines: `apps/api/src/layers/orchestration/pipelines/{graphragPipeline,basicRag,llmOnly}.ts`. Eval route: `apps/api/src/routes/crmEval.ts`. BERTScore: `scripts/compute-bertscore.mjs`.

> Note: an earlier run on a smaller 405-chunk BasicRAG index showed GraphRAG 88/90 (97.8%) vs BasicRAG 46.7%. The numbers above use the **fairer** 2,000-chunk BasicRAG index — a more defensible comparison (smaller but honest gap). The 87 vs 88 GraphRAG difference is normal run-to-run variance (±1 question).
