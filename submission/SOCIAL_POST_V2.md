# LinkedIn/X — Round 2 announcement post (v2, final)

🎉 We made it to Round 2 — Top 15 — of the TigerGraph GraphRAG Inference Hackathon 2026!

Round 1 proved a graph beats vector search on a small dataset. Round 2 asked us to prove it at 100M+ tokens — so we scaled CRM Nexus to a **158M-token** synthetic CRM, rebuilding the whole knowledge graph and fighting through plenty of infra gremlins to get there.

**How it works:** most RAG dumps the 15 most "similar" chunks into the prompt and hopes the answer's in there. For a relational question like *"which customers were hit by this outage through their shared vendor and region?"* — it isn't, because that answer spans multiple hops. GraphRAG instead embeds the question, finds the seed entities via vector search, then **traverses the graph's relationships** (outage → region → vendor → customers) to hand the LLM only the connected facts — a focused ~1,500-token brief instead of a 10,000-token wall.

Same LLM, same 90 questions, only retrieval changes:
→ **96.7% accuracy** (vs 71.1% for flat RAG)
→ **86% fewer tokens**
→ **17.5% faster**
→ **BERTScore F1 0.93**

The takeaway: flat similarity ranks by surface match — it can't reason across relationships. Graph traversal can.

Built on TigerGraph Community Edition — native vector search + multi-hop traversal in one engine is what made this practical.

GitHub → github.com/vishnu-k-dev/crm-nexus
Live → crm-nexus-team-brocode.vercel.app

Team BroCode
#GraphRAG #TigerGraph #LLM #RAG #AI
