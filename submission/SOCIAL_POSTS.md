# CRM Nexus — Round 2 Social + Blog (FINAL verified numbers)

Numbers used (verified, rebuilt graph, 90 questions):
GraphRAG 96.7% (87/90) · BasicRAG 71.1% (64/90) · LLM-Only 3.3% · token reduction 86.4% (1,483 vs 10,867) · latency 7.5s vs 9.1s (17.5% faster) · BERTScore F1 raw 0.932 / rescaled 0.599 · 158M tokens / 100,820 docs · Gemini 2.5 Flash (all 3 pipelines) · judge Groq Llama 3.1 8B.

---

## LinkedIn / X post

CRM data is relational. "Which customers were hit by this outage through their shared vendor and region?" isn't in any single chunk — it spans multiple hops across your data.

BasicRAG can't follow those hops. It embeds the question, grabs a pile of similar chunks, and bills you for ~10,000 tokens. Even when we gave it the exact documents, it answered 64 of 90 CRM questions correctly.

We mapped the same data into TigerGraph and let GSQL walk the relationships directly.

Same LLM (Gemini 2.5 Flash). Same 90 questions. Same data. Only retrieval changes:
→ Accuracy: 96.7% vs 71.1%
→ Tokens: 86% fewer (1,483 vs 10,867)
→ Latency: 17.5% faster (7.5s vs 9.1s)
→ BERTScore F1: 0.93 (raw) / 0.60 (rescaled)

The gap is structural — flat similarity ranks by surface match and can't reason across relationships. Graph traversal can. Smarter, cheaper, AND faster.

158M-token synthetic CRM, all on TigerGraph Community Edition.

GitHub → github.com/vishnu-k-dev/crm-nexus
Live dashboard → crm-nexus-team-brocode.vercel.app

Built for the TigerGraph GraphRAG Inference Hackathon 2026 — Team BroCode (Vishnu K & Revanth M)

#GraphRAG #TigerGraph #GraphDatabase #LLM #RAG #AI
