# CRM Nexus — Demo Video Script & Shot List
**Team BroCode · TigerGraph GraphRAG Inference Hackathon 2026**
Target length: **5–7 min**. Judging is on this recorded video, so prioritize clarity + reproducibility.

> **NUMBERS POLICY:** Every metric below is a placeholder `[[like this]]` to be filled from the **final eval on the rebuilt graph** before recording. Working/provisional values are noted in parentheses so the script reads naturally now. Do NOT record with provisional numbers if the final eval differs — anchor to measured results.
>
> Provisional (what we currently trust):
> - Accuracy: published **97.8% (88/90)**; last clean measured run **95.6% (86/90)** (Groq, May 31)
> - Token reduction vs BasicRAG: published **~80%**; measured **72.9%** (GraphRAG ~1,400 vs BasicRAG ~5,150 prompt tokens)
> - Dataset: **255M tokens**, 100,820 CRM docs, ~589K embedded chunks (full embed)
> - BERTScore F1: **0.846** (re-confirm on rebuilt graph)

---

## SETUP BEFORE RECORDING (checklist)
- [ ] Rebuilt graph finished embedding + **verified backup exists** (`gstore_clean_*.tgz`)
- [ ] Run final 90Q eval → record real numbers → fill all `[[placeholders]]`
- [ ] All demo questions below **pre-run once** and confirmed clean (GPE stays Online)
- [ ] Dashboard (`localhost:5173`) loads with final numbers; site (`web/index.html`) open
- [ ] Screen clean, font size up, no error toasts; dry-run the full flow once

---

## 1 · HOOK (0:00–0:45)
**Say:** "Enterprise CRM systems hold millions of interconnected records — customers, vendors, outages, contracts. When you ask an AI a question like *'which customers were hit by this outage through their shared vendor?'*, traditional RAG dumps dozens of loosely-similar documents into the prompt and burns thousands of tokens — and still often gets it wrong. We built CRM Nexus to answer relationship-heavy questions by **traversing a knowledge graph** instead of guessing by similarity."
**Show:** Title slide → quick pan of the landing page hero (255M tokens, the 3 stat cards).

## 2 · DATASET + SCALE (0:45–1:30)
**Say:** "Our benchmark is a synthetic CRM mapped into TigerGraph: **[[255M]] tokens across 100,820 documents**, re-chunked and embedded into roughly **[[589K]] vector chunks**. Customers depend on vendors; vendors cause outages; outages hit regions. That web of relationships is exactly what flat vector search can't follow — and what a graph is built for."
**Show:** Dataset section of the site (entity breakdown bars) → a quick TigerGraph GraphStudio or schema view if available.

## 3 · ARCHITECTURE (1:30–2:30)
**Say:** "Three pipelines, same LLM brain, so the only variable is retrieval. **LLM-Only** answers from memory. **BasicRAG** does flat cosine similarity over a vector store. **GraphRAG** embeds the question, finds seed chunks in TigerGraph's native HNSW index, then traverses graph edges — `IS_AFTER`, vendor and region relationships — to pull *only* the connected context. Same Llama model generates the final answer in all three."
**Show:** The 4-layer architecture diagram (Graph → Orchestration → LLM → Evaluation) + the GSQL traversal code block.

## 4 · SIDE-BY-SIDE DEMO (2:30–5:00) — the centerpiece
Run these on the live dashboard (`/api/compare`), GraphRAG vs BasicRAG vs LLM-Only. **Use only the verified questions below.**

**Q1 — single-hop precision (warm-up):**
> "What is the severity level of outage OUTAGE-001?"
- GraphRAG: *"Outage OUTAGE-001 (P3, 32 hours, REGION-FRANKFURT, VEND-01)…"* ✅ ~1,500 tokens
- BasicRAG: *"OUTAGE-001 is not in the provided context"* ❌ ~10,000 tokens
- **Point:** graph fetched the exact record; flat search couldn't even find it, at 6× the tokens.

**Q2 — customer→vendor relationship:**
> "Which vendor is customer CUST-0001 primarily dependent on?"
- GraphRAG: *"VEND-01 (MedSync)…"* ✅ — **Point:** one-hop traversal, surgical.

**Q3 — vendor impact analysis (aggregation):**
> "How many outages has VEND-15 experienced?"
- GraphRAG: *"2 outages: OUTAGE-015, OUTAGE-065."* ✅ (verified)

**Q4 — the killer multi-hop:**
> "How many customers were directly impacted by OUTAGE-001 through shared vendor and region dependency?"
- GraphRAG: *"8 customers — CUST-0001, CUST-0021 … — all sharing VEND-01 and REGION-FRANKFURT."* ✅
- BasicRAG: ❌ no incident report found.
- **Point:** this is the whole thesis — OUTAGE-001 → REGION-FRANKFURT → VEND-01 → customers, in one GSQL traversal. Vector search structurally cannot do this.

**Show for each:** the token-comparison bars (GraphRAG tiny vs BasicRAG large), the PASS/FAIL chips, the live graph-traversal animation.

## 5 · BENCHMARK RESULTS (5:00–6:00)
**Say:** "Across all 90 questions, same LLM: GraphRAG scored **[[97.8%]]** versus BasicRAG's **[[~28%]]**, while using **[[~80%]] fewer tokens** and answering far faster. BERTScore F1 **[[0.846]]**, well above the 0.55 bar."
**Show:** The dashboard benchmark charts (accuracy bars, token line chart, latency).
> **Reminder:** fill these from the final rebuilt-graph eval. If the rebuilt-graph number differs from 97.8%, use the rebuilt number and update the site to match for consistency.

## 6 · CLOSING (6:00–6:45)
**Say:** "Graph-aware retrieval isn't just more accurate — it's cheaper and faster, because the graph *is* the filter. For any enterprise sitting on interconnected knowledge — CRM, supply chain, security — this is how you get correct answers without paying for context the model never needed. Built on TigerGraph Community Edition. Thanks for watching."
**Show:** Closing slide — logo, team, repo URL, the 4 headline stats.

---

## LIVE-DEMO CONTINGENCY — validated "safe set"
If called for a live demo, lead with these (all confirmed clean on the rebuilt graph in smoke tests; GPE stayed Online):
1. OUTAGE-001 severity → P3 / FRANKFURT / VEND-01 ✅
2. CUST-0050 region/segment → Mid-Market, Pharma ✅
3. VEND-15 outage count → 2 (OUTAGE-015, OUTAGE-065) ✅
4. VEND-01 customer count → 250 ✅
5. CUST-0001 primary vendor → VEND-01 (MedSync) ✅

For arbitrary judge questions: **re-run the full stability probe on the final rebuilt graph first** (target 0 GPE crashes). Only claim "handles any question" if that probe passes clean — otherwise steer toward the entity-ID questions, which resolve via direct lookup and are the most robust.
