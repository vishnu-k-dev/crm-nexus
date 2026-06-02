# CRM Nexus — Benchmark Proof (Final, Verified)
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Run date: 2026-06-02 · Graph: rebuilt & stable (577,175 embedded chunks)

## Final results — 90 evaluation questions

| Metric | GraphRAG | BasicRAG | LLM-Only |
|---|---|---|---|
| **Accuracy (LLM-judge PASS)** | **87/90 = 96.7%** | 64/90 = 71.1% | 3/90 = 3.3% |
| **BERTScore F1 (rescaled)** | **0.599** (≥0.55 ✅) | 0.454 | 0.089 |
| **BERTScore F1 (raw)** | **0.932** (≥0.88 ✅) | 0.908 | 0.846 |
| **Avg prompt tokens** | **1,483** | 10,867 | — |
| **Avg latency** | **7,495 ms** | 9,090 ms | — |

**Headline:** GraphRAG is simultaneously **more accurate** (96.7% vs 71.1%), **cheaper** (86.4% fewer prompt tokens), and **faster** (17.5% lower latency) than a flat-vector RAG baseline — on the same data, with the same LLM.

## Methodology (fairness controls)
- **Same LLM for all three pipelines** — `gemini-2.5-flash`. Only the retrieval layer differs, isolating retrieval quality.
- **Same 90 questions** — 50 single-hop + 40 multi-hop (outages, customers, vendors, employees, tickets, compliance, projects, regions).
- **Independent judge** — Groq `llama-3.1-8b-instant` assigns PASS/FAIL vs reference answers; not self-scored.
- **BasicRAG** — standard flat-vector RAG baseline over the same CRM corpus (cosine similarity retrieval, same LLM for generation).
- **BERTScore** — canonical HuggingFace `bert_score` (roberta-large), reported both `rescale_with_baseline=True` (0.599) and raw (0.932). GraphRAG clears both bonus bars. Script: `scripts/real_bertscore.py`.

## GraphRAG's 3 misses (honest)
All three are hard multi-hop **aggregation** questions (q16, q51, q58) — e.g., "how many projects in REGION-FRANKFURT were impacted by OUTAGE-001."

## Dataset
- CRM core: **~158.5M tokens** across **100,820 documents** → 577,175 embedded chunks in TigerGraph (HNSW vector index). **1.58× the 100M-token hackathon minimum** (measured via Gemini `count_tokens`).

## Why GraphRAG wins (the defensible point)
The gap is **structural**: flat cosine similarity ranks by surface match and has no concept of graph edges, so it cannot reason across relationships (outage → region → vendor → customers). Graph traversal can. This is a retrieval-**method** advantage, not a data-coverage one.

## Raw data / reproducibility
- Final results: `data/crm_eval_results.json` (per-question answers, judge verdicts, tokens, latency, BERTScore).
- Backups: `benchmark_88_90_backup_20260531/crm_eval_FINAL_fair_20260602.json`; graph snapshot `gstore_clean_20260602_134940.tgz`.
- Pipelines: `apps/api/src/layers/orchestration/pipelines/`. Eval route: `apps/api/src/routes/crmEval.ts`. BERTScore: `scripts/real_bertscore.py`.
