# TechProbe AI — GraphRAG vs Baseline LLM

**TigerGraph GraphRAG Inference Hackathon 2026 entry.**

A candidate gives us a GitHub repo. We generate technical interview questions personalized to what they actually built. Two pipelines, same model, same instruction:

| Pipeline | Context | Prompt tokens | Latency | Cost / query | Quality (Sonnet judge) |
|----------|---------|--------------:|--------:|-------------:|-----------------------:|
| Baseline | Full repo dump (file tree + READMEs + package files) | ~2,500 | tbd | tbd | tbd |
| GraphRAG | TigerGraph 3-hop traversal: `Repo → Tech → Domain → DepthMarker → Question` | ~600 | tbd | tbd | tbd |

> Numbers populated by `npm run bench` and visible live at `/bench` in the web app.

## Architecture (AI-Factory 4 layers)

```
 ┌──────────────────────────────────────────────────────┐
 │  Web (Vite/React) — Demo, animated GraphView, Race   │
 └────────────────────────┬─────────────────────────────┘
                          │ HTTP
 ┌────────────────────────▼─────────────────────────────┐
 │  Inference Orchestration (Fastify)                   │
 │   ├─ pipelines/baseline.ts                           │
 │   └─ pipelines/graphrag.ts  ──┐                      │
 ├──────────────────────┬────────┼──────────────────────┤
 │  Graph Layer         │   LLM Layer (Claude Haiku)    │
 │  TigerGraph Cloud    │   shared between pipelines    │
 ├──────────────────────┴───────────────────────────────┤
 │  Eval Layer — Sonnet judge (independent), SQLite log │
 └──────────────────────────────────────────────────────┘
```

## Quick start

```bash
cp .env.example .env  # fill TG_* and ANTHROPIC_API_KEY
npm install
npm run seed          # loads ontology + eval_set into TigerGraph
npm run dev           # api on :3001, web on :5173
npm run bench         # runs both pipelines on the 50-repo eval set
```

## Why GraphRAG wins here

A GitHub repo is *already* a graph: files reference techs, techs imply domains, domains have depth markers, depth markers have proven-good probe questions. Stuffing the repo into a prompt asks the LLM to re-derive that graph every time. Pre-computing it once and traversing on demand is straight-up cheaper and produces sharper questions because we filter to the *exact* probes that match the candidate's stack.

## Hackathon submission

- Demo video: `./docs/demo.mp4` (< 3 min)
- Slide deck: `./docs/deck.pdf`
- Live dashboard screenshot: `./docs/dashboard.png`

See [the plan](../../.claude/plans/c-users-vishn-downloads-creda-graphrag-glowing-creek.md) for the full build narrative.
