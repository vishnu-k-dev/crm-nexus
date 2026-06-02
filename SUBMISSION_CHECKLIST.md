# CRM Nexus — Round 2 Submission Checklist
Deadline: **June 3, 2026** · Submit via **Unstop** · Team BroCode

## ✅ DONE
- [x] **3 pipelines** — LLM-Only, Basic RAG, GraphRAG (on TigerGraph GraphRAG repo)
- [x] **Dataset ≥100M tokens** — **158.5M** (CRM core, 100,820 docs). >75M hard floor, >80M competitive. Measured via Gemini `count_tokens`. ✓
- [x] **Comparison dashboard** — running at localhost:5173, one query → 3 pipelines side-by-side w/ tokens, latency, cost, accuracy. Updated with final numbers.
- [x] **Benchmark numbers (verified, backed up)** — `BENCHMARK_PROOF.md` + `data/crm_eval_results.json`:
  - GraphRAG **96.7%** · BasicRAG 71.1% · LLM-Only 3.3% (LLM-judge)
  - Token reduction **86.4%** (1,483 vs 10,867) · GraphRAG **faster** (7.5s vs 9.1s)
  - Semantic F1 **0.865**
- [x] **Architecture diagram** — on landing page (update only if changed)

## 🔴 PENDING — before June 3
- [ ] **Demo video (5–7 min)** — ⚠️ HIGHEST PRIORITY (judging scores on this). Script ready: `DEMO_VIDEO_SCRIPT.md` + `DEMO_PRESENTATION.md`. RECORD IT.
- [ ] **Update all published numbers** — run the index-page prompt; same for `BLOG_POST.md` + demo scripts (96.7% / 71.1% / 86.4% / 0.865 / 158M / faster). One consolidated pass.
- [ ] **Real BERTScore** — see DECISION below (needed for rubric + bonus).
- [ ] **Benchmark report** — package `BENCHMARK_PROOF.md` into the submission format (tokens, cost, latency, BOTH accuracy metrics per pipeline).
- [ ] **Blog post** — update `BLOG_POST.md` with Round 2 numbers, publish (Medium/Dev.to/Hashnode).
- [ ] **Social post** — LinkedIn/Twitter, tag **@TigerGraph**, **#GraphRAGInferenceHackathon**.
- [ ] **Push Round 2 code** to the public GitHub repo.
- [ ] **Product Feedback Interview** (Top 5–15) — DM Devanshu on WhatsApp to schedule (30 min).
- [ ] **Submit on Unstop** — upload everything before deadline.

## ⚖️ DECISIONS NEEDED
1. **BERTScore method.** The rubric explicitly wants canonical HuggingFace `evaluate.load("bertscore")` with `rescale_with_baseline=True`. **We currently have a Jina-cosine *proxy* (0.865), not real BERTScore.** Bonus thresholds (F1 rescaled ≥0.55 OR raw ≥0.88) are scored on the real metric.
   → **Recommend: compute real BERTScore** (HF evaluate lib, ~1.4GB model, one-time) on our saved answers, so the number is rubric-compliant and the bonus is legitimately claimable. If we keep the proxy, relabel it "semantic similarity" (not BERTScore) everywhere.
2. **Headline accuracy** = 96.7% (final fair run). Locked.

## 🎁 BONUS STATUS (extra judging points)
- LLM-as-a-Judge ≥90% → **96.7% ✓ qualifies**
- BERTScore F1 rescaled ≥0.55 (or raw ≥0.88) → **TBD — need real BERTScore to confirm.** Hitting both = max bonus.

## Judging weights (for reference)
Token Reduction 30% · Answer Accuracy 30% · Performance 20% · Engineering & Storytelling 20%.
Our story hits all four: 86% token cut, 96.7% accuracy, faster latency, clean dashboard + (pending) video/blog.
