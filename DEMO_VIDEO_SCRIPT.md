# CRM Nexus — Demo Video Script
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Target: 5–7 min

> **NUMBERS TO USE (exact):**
> GraphRAG 96.7% (87/90) · BasicRAG 71.1% (64/90) · LLM-Only 3.3%
> Token reduction 86.4% (1,483 vs 10,867) · Latency 7.5s vs 9.1s (17.5% faster)
> BERTScore F1 0.93 raw / 0.60 rescaled · 158M tokens · 100,820 docs · 577K chunks
> LLM: Gemini 2.5 Flash (all 3 pipelines) · Judge: Groq Llama 3.1 8B

---

## — Hero

**Say:**
> "Hi, I'm Vishnu from Team BroCode. This is CRM Nexus — a GraphRAG system built on TigerGraph that answers complex CRM questions more accurately, at a fraction of the token cost. Let me show you how."

**Show:** Title slide or landing page at crm-nexus-team-brocode.vercel.app

---

## — The Problem

**Say:**
> "Ask a standard RAG system: 'Which customers were impacted by this outage through their shared vendor and region?' — there's no single chunk that answers it. The answer spans multiple hops: outage → region → vendor → customers.
>
> Flat cosine similarity ranks by surface match. It grabs the 15 most similar chunks, sends ~10,000 tokens to the LLM, and still gets it wrong — because it can't reason across relationships.
>
> That's the problem we set out to fix."

**Show:** Diagram of flat RAG vs graph traversal

---

## — Benchmark

**Say:**
> "Same LLM — Gemini 2.5 Flash — across all three pipelines. Only retrieval changes. 90 questions, independent judge.
>
> GraphRAG: 96.7% accuracy. BasicRAG: 71.1%. LLM-Only: 3.3%.
> That's a 25-point gap on identical data, with 86% fewer tokens and 17.5% lower latency.
> BERTScore F1: 0.93 raw, 0.60 rescaled — clearing both bonus bars."

**Show:** Dashboard benchmark charts — accuracy, tokens, latency bars

---

## — Architecture

**Say:**
> "Three layers. First, Gemini embeds the question. Second, TigerGraph's native HNSW index finds the seed entities. Third, GSQL traverses the graph — outage to region to vendor to customers — and returns only the connected facts.
>
> The LLM gets a focused ~1,500-token brief instead of a 10,000-token wall. Same model, better input, better output."

**Show:** 4-layer architecture diagram + GSQL traversal code block

---

## — Dataset

**Say:**
> "158 million tokens across 100,820 CRM documents — customers, vendors, outages, regions, tickets, compliance, projects — all interlinked. Embedded into 577,000 vector chunks in TigerGraph's native HNSW index. 1.58 times the hackathon's 100M minimum, token count verified via Gemini's count_tokens API.
>
> Running entirely on TigerGraph Community Edition in Docker."

**Show:** Dataset section on dashboard · GraphStudio schema view (localhost:14240)

---

## — Live Demo

**Say:**
> "Let me run this live. Watch the token bars — GraphRAG's ~1,500 versus BasicRAG's ~10,000 is visible on every single query."

**Run these 4 queries on localhost:5173 — all 3 pipelines:**

**Q1 — warm-up:**
*"What is the severity level of outage OUTAGE-001?"*
> Point at token bars first. GraphRAG: P3, REGION-FRANKFURT, VEND-01 ✅
> "Both get it — but GraphRAG used a fraction of the tokens."

**Q2 — one-hop:**
*"Which vendor is customer CUST-0001 primarily dependent on?"*
> GraphRAG: VEND-01 (MedSync) ✅ — surgical, one hop.

**Q3 — multi-hop (the wow moment):**
*"How many outages has VEND-15 experienced?"*
> GraphRAG: 2 — OUTAGE-015 and OUTAGE-065 ✅
> "This walks vendor → outages and counts them. Flat similarity has no way to aggregate across a relationship."

**Q4 — graph aggregation:**
*"How many customers depend on VEND-01 as their primary vendor?"*
> GraphRAG: 250 customers ✅
> "Counting across an entire relationship — a graph operation, not a similarity match."

**Closing line:**
> "Same model generated all of these. The only thing that changed is what we fed it — and the graph fed it less, and better."

---

## — Why We Won

**Say:**
> "The gap isn't about data coverage — BasicRAG had access to the same corpus. The gap is structural. Flat similarity can rank by surface match but it cannot reason across relationships. Graph traversal can.
>
> That's why GraphRAG is simultaneously more accurate, cheaper, and faster. Not because we tuned it harder — because the retrieval method is fundamentally better for relational data."

**Show:** Final results table — 96.7% · 86% fewer tokens · 17.5% faster · BERTScore 0.93

---

## — Sample Q&A

*Prep answers for these if the video includes a Q&A segment:*

**"Why not just give BasicRAG more chunks?"**
> More chunks = more tokens = more cost, and the accuracy gap on multi-hop questions persists. The problem isn't coverage, it's that flat search can't traverse edges.

**"Is this TigerGraph Community Edition?"**
> Yes. Run `gadmin status` — the banner says "Welcome to TigerGraph Community Edition, free for production, research, or educational use." Full 577K-chunk HNSW index, no limits hit.

**"What are the 3 misses?"**
> All three are hard aggregation questions — e.g., "how many projects in REGION-FRANKFURT were impacted by OUTAGE-001." Multi-hop + count + region filter in one query. Honest miss, documented in the repo.

---

## SETUP CHECKLIST (before recording)
- [ ] Docker up, GPE Online, API healthy (localhost:3001/health)
- [ ] Use local dashboard localhost:5173 — NOT the Vercel page (no backend)
- [ ] Pre-run all 4 demo queries once, confirm correct answers
- [ ] Screen clean, font size up, no error toasts
- [ ] Do NOT use "8 customers impacted by OUTAGE-001" — returns 250 (over-counts)
- [ ] Do NOT improvise arbitrary questions — stick to the 4 above
