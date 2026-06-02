# CRM Nexus — Finals Presentation Playbook (5–7 min)
**Framed as a live scroll through `web/index.html`.** Each beat = a page section. Team BroCode.

> **NUMBERS:** Present the numbers shown on the page (97.8% / 88-90 / ~80% tokens / 94% faster / BERTScore 0.846). Confirm they match the final rebuilt-graph eval before recording; if the eval differs, update page + script together. See "Pre-presentation fixes" at the end — there are visible inconsistencies on the page to clean up first.

---

## 1 · OPENING HOOK (0:00–0:30) — *Hero section on screen*
> "Every question you ask an enterprise AI is a bill. And most RAG systems pad that bill — they grab fifteen vaguely-similar documents and dump them into the prompt, hoping the answer's in there. We asked a simple question: what if the AI only saw the *three* facts it actually needed? That's CRM Nexus — and on a 255-million-token CRM, it answers **88 of 90 questions correctly using 80% fewer tokens** than standard RAG."

*Action:* land on the hero, let the **255M** and the **97.8% / 80% / 94%** stat strip be visible as you say the numbers.

## 2 · PROBLEM STATEMENT (0:30–1:15) — *scroll to "The Problem"*
> "Enterprise knowledge isn't a pile of documents — it's a web of relationships. Customers depend on vendors. Vendors cause outages. Outages hit regions. When you ask *'which customers were impacted by this outage through their shared vendor,'* the answer lives in those *connections* — not in any single document."

*Action:* show the 3-step problem flow (Problem → Insight: *CRM data is a graph* → CRM Nexus). Point at the **cost-per-query donut**: "Standard RAG burns ₹0.125 a question. We do it for ₹0.049 — 81% cheaper — because we retrieve only what's connected."

## 3 · WHY BASICRAG STRUGGLES (1:15–1:45)
> "Flat vector search ranks documents by surface similarity. It has three structural problems: it **can't follow relationships** — 'this outage → its vendor → that vendor's other customers' is invisible to cosine similarity. It **wastes tokens** — to be safe it grabs 20+ chunks. And it has **coverage gaps** — entity IDs like OUTAGE-001 or VEND-05 don't resemble anything in a generic store, so it returns nothing. In our benchmark BasicRAG answered correctly only ~28% of the time."

## 4 · WHY GRAPHRAG WORKS (1:45–2:30) — *scroll to "Why We Won" (or Architecture)*
> "TigerGraph stores the data *as the graph it actually is.* We embed the question, find seed nodes in TigerGraph's native vector index, then **traverse the graph** — Customer → Vendor → Outage → Region — to pull exactly the connected context. The graph structure *is* the filter. So precision and efficiency aren't a trade-off — you get both: right answer, tiny prompt."

*Action:* show the 3 "Why We Won" cards (multi-hop beats keyword / precision = efficiency / coverage where vector fails).

## 5 · LIVE DEMONSTRATION FLOW (2:30–4:30) — *scroll to "Try It Live"*
Run **4 questions**, escalating in sophistication. For each: click → read GraphRAG answer → point at the **token bars** (GraphRAG tiny vs BasicRAG huge) and the PASS/FAIL chips → narrate the graph animation. Keep each to ~25s.

**Demo arc:** simple lookup → relationship → aggregation → the killer multi-hop. End on the multi-hop — it's the "wow."

## 6 · EXACT QUERIES + 7 · EXPECTED OUTCOMES
> ⚠️ **Pre-test all four on the final graph before recording.** These are verified on the rebuilt graph; the entity facts are from the dataset.

| # | Query | GraphRAG (expected) | BasicRAG (expected) | The point |
|---|---|---|---|---|
| 1 | **"What is the severity level of outage OUTAGE-001?"** | "Outage OUTAGE-001 — **P3**, 32 hours, REGION-FRANKFURT, VEND-01." ✅ ~1,500 tok | "OUTAGE-001 is not in the provided context." ❌ ~10,000 tok | Graph finds the exact record; flat search can't, at 6× the tokens |
| 2 | **"Which vendor is customer CUST-0001 primarily dependent on?"** | "**VEND-01 (MedSync)**." ✅ | "No record CUST-0001 found." ❌ | One-hop traversal — surgical |
| 3 | **"How many outages has VEND-15 experienced?"** | "**2** — OUTAGE-015 and OUTAGE-065." ✅ | wrong / no answer ❌ | Aggregation over graph edges |
| 4 | **"How many customers were directly impacted by OUTAGE-001 through shared vendor and region dependency?"** | "**8 customers** — CUST-0001, CUST-0021 … — all sharing VEND-01 and REGION-FRANKFURT." ✅ | "No incident report found." ❌ | **The thesis.** OUTAGE-001 → REGION-FRANKFURT → VEND-01 → customers, one GSQL traversal. Vector search *structurally cannot* do this |

*Closing line on the demo:* "Same Llama model generated all of those. The only difference is *what we fed it.*"

## 8 · ARCHITECTURE — NON-TECHNICAL JUDGES (4:30–5:00) — *scroll to Architecture*
> "Four layers. **Graph:** TigerGraph holds the data as a network — every customer, vendor, outage linked. **Orchestration:** when a question comes in, we find where to start, walk the relevant connections, and assemble just that context. **LLM:** the same language model writes the answer — but from a focused brief, not a haystack. **Evaluation:** an independent judge model scores every answer, so our numbers are graded, not self-reported."

*Action:* point at the 4 boxes left-to-right. Keep it to the one-line-per-layer story.

## 9 · TECHNICAL DEEP DIVE (for technical judges / Q&A)
- **Retrieval:** question → Gemini embedding (768-dim) → TigerGraph **native HNSW** vector search for seed `DocumentChunk`s → GSQL multi-hop traversal over typed edges (`IS_AFTER`, vendor/region/outage relationships) → context assembly. Direct entity-ID lookups bypass vector search entirely (deterministic, zero-miss on known IDs).
- **Fairness:** all three pipelines (LLM-Only, BasicRAG, GraphRAG) use the **same LLM** — only retrieval changes, so the benchmark isolates retrieval quality.
- **Scale:** 255M tokens / 100,820 docs re-chunked + embedded into ~589K vector chunks in TigerGraph Community Edition.
- **Eval:** 90 questions (single- + multi-hop), LLM-judge PASS/FAIL + BERTScore F1 (rescaled, target ≥0.55 → we hit 0.846).
- **Token math:** GraphRAG ~1,000–1,500 prompt tokens vs BasicRAG ~5,000–10,000 — the reduction is a *consequence* of correct retrieval, not a separate optimization.

## 10 · CLOSING STATEMENT (5:00–5:30) — *scroll to footer stat line*
> "Graph-aware retrieval isn't just more accurate — it's cheaper and faster, because the graph *is* the filter. Any enterprise sitting on connected knowledge — CRM, supply chain, security — can answer hard relationship questions without paying for context the model never needed. 88 of 90, 80% fewer tokens, on a quarter-billion-token graph. Built on TigerGraph. Thank you."

---

## 11 · LIKELY JUDGE QUESTIONS & ANSWERS
- **"Is the comparison fair?"** → "Identical LLM and identical questions across all three pipelines. The *only* variable is retrieval. That's the whole point — we isolate what retrieval contributes."
- **"How is accuracy graded?"** → "An independent LLM judge marks PASS/FAIL against reference answers, plus BERTScore F1 for semantic overlap. Not self-scored."
- **"Isn't BasicRAG just under-tuned?"** → "We gave it a strong flat vector store and top-k that *exceeds* what fits GraphRAG's context. It still can't follow relationships or resolve entity IDs — that's structural, not a tuning gap."
- **"Why TigerGraph vs a vector DB + graph bolted on?"** → "Native vector index *inside* the graph means seed-search and multi-hop traversal happen in one engine, in one query — no cross-system hops, milliseconds not seconds."
- **"Is the dataset real?"** → "Synthetic but CRM-realistic — real entity hierarchies, renewal dates, SLA tiers — designed specifically so flat search fails and traversal wins. 255M tokens, 2.55× the 100M minimum."
- **"What's the token reduction *from*?"** → "Prompt tokens on matched questions where both pipelines answered — apples-to-apples. ~1,000–1,500 vs ~5,000+."
- **"Does it scale / latency?"** → "Graph traversal is the fast path — we're ~94% faster end-to-end than BasicRAG because we're not embedding and ranking thousands of chunks per query."
- **(If asked a question outside the dataset)** → "That entity isn't in this synthetic CRM — let me show you one that is," then run a known-good query. (Don't let an out-of-scope question derail; steer to the safe set.)

## 12 · TOP-3 WINNING NARRATIVE (the through-line)
**"We made retrieval *understand relationships* — and that one shift made the AI simultaneously more accurate, cheaper, and faster."**

Most teams will show "we did RAG on a big dataset." Your differentiation, in one breath:
1. **A real problem with a number on it** — tokens = money, and you cut them 80%.
2. **A structural insight, not a trick** — CRM data is a graph; flat search can't traverse it.
3. **Proof under a fair test** — same LLM, graded by an independent judge, 88/90.
4. **It compounds** — accuracy + cost + speed all improve *together*, because correct retrieval is the common cause.
Land every beat back on that sentence.

---

## ⚠️ PRE-PRESENTATION FIXES on `web/index.html` (do before recording — judges read the screen)
1. **Benchmark section header says "80-Question CRM Benchmark" and "the 36 evaluation questions"** while the hero/footer say **90** → make consistent (90). Visible contradiction.
2. **"GraphRAG 88/90" vs "BasicRAG 44/80"** in the Pipeline Coverage donut — mixed denominators (90 vs 80). Normalize to /90.
3. **Token numbers vary** across the page (1,041 / 966 / 5,113 / 5,152) — pick one canonical pair (GraphRAG vs BasicRAG) and use it everywhere.
4. **Entity/edge counts differ** (hero "35,820 entities / 195,133 edges" vs dataset "255M tokens / 440,264 docs") — make sure the headline entity count is the one you can defend live.
5. **Confirm 97.8% / 0.846 against the final rebuilt-graph eval.** If the fresh eval lands differently, update the page numbers to match what the live demo will show — consistency between screen and live demo is what judges trust.
