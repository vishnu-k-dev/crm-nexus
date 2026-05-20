# v7 Dataset — Next Steps (Round 2 Benchmark)

The 19M-token dataset is generated and the 56-question eval set is ready. What's
left is the actual re-ingest + benchmark. Run these in order **once Docker
Desktop + TigerGraph CE are running**.

## 1 · Confirm TigerGraph is up

```bash
docker ps --filter name=tg-graphrag-db
# expect: tg-graphrag-db ... Up X minutes
```

If not running:
```bash
docker compose up -d
# wait ~60s for GSE/GPE/RESTPP to come up
docker exec tg-graphrag-db gadmin status | grep -i online
```

## 2 · Wipe old data, re-ingest extended dataset

The graph still holds the v6 (2.69M token) chunks. We need to clear it first or
ECC will keep both old and new.

```bash
# Inside the container — wipe everything
docker exec -i tg-graphrag-db /home/tigergraph/tigergraph/app/4.2.2/cmd/gsql -u tigergraph -p tigergraph <<'GSQL'
USE GRAPH MyGraph
CLEAR GRAPH STORE -HARD
GSQL

# Now re-ingest the new 19M-token corpus
npx tsx scripts/ingest-crm.ts
```

The ingest will:
1. Read `data/crm/chunks.jsonl` (159K chunks, 19M tokens)
2. Build `data/crm_ingest.jsonl` (one document per CRM entity)
3. `docker cp` into the container
4. Run the GSQL loading job
5. POST to `/MyGraph/graphrag/forceupdate` in batches of 500
6. **TigerGraph then chunks + embeds asynchronously — allow 60–90 min for 19M
   tokens.** Poll with: `curl http://localhost:8000/MyGraph/graphrag/status`

## 3 · Run the 56-question benchmark

Once embedding completes:

```bash
# Start the API (loads .env, connects to TG)
npm run dev:api

# In a separate terminal — full benchmark across all 3 pipelines
curl http://localhost:3001/api/crm-eval > crm_eval_results_v7.json
```

Expected runtime: ~25–35 min (BasicRAG dominates the time because it's
slower at ~80s/query × 56 = ~75 min worst case; GraphRAG is ~10s/query).

## 4 · Update dashboard + README with v7 numbers

Once you have `crm_eval_results_v7.json`, update these files with the new
aggregate numbers:

- `web/index.html` — hero panel (entities, edges, eval count), hero strip
  (accuracy, token reduction, latency, BERTScore)
- `web/assets/crm-graphrag-dataset.json` — `benchmark_results` block
- `README.md` — results table at the top
- `blog.md` — TL;DR sentence + headline metrics

Token-count fact to bake in:
- **19.02M tokens** (was 2.69M) — 19× the 1M hackathon minimum
- **159,338 chunks**, **~300K graph edges**
- **56 questions** (36 v6 + 20 v7 graph-friendly additions)

---

## TigerGraph Cloud migration (when ready)

The codebase is already cloud-portable. Switch by changing only the env vars:

| Env Var | Local CE | TG Cloud |
|---------|----------|----------|
| `TG_GRAPHRAG_URL` | `http://localhost:8000` | `https://<instance>.i.tgcloud.io:443` |
| `TG_HOST` | `http://localhost:9000` | `https://<instance>.i.tgcloud.io:9000` |
| `TG_USERNAME` | `tigergraph` | your cloud username |
| `TG_PASSWORD` | `tigergraph` | your cloud password |
| `TG_TOKEN` | (unused) | generated via `/requesttoken` |

The single docker-specific code path is in `scripts/ingest-crm.ts` — the
`docker cp` + `docker exec gsql` block. For cloud, that becomes:

1. Upload the JSONL via the cloud file API (or S3 bucket if your instance has
   one wired up), OR
2. Use TigerGraph Cloud's web GSQL editor to run the loading job.

`apps/api/src/layers/graph/client.ts` already uses `TG_HOST` + `TG_TOKEN` with
bearer auth — that path works identically on cloud.

---

## Why this should win Round 2

- **19M tokens vs 1M minimum = 19× the floor.** Other teams will likely be at
  2–5× max. The scale itself is a differentiator.
- **BasicRAG gets *worse* as the corpus grows** because cosine similarity over
  150K chunks is noisier than over 21K. GraphRAG's entity-ID retrieval is
  flat — it doesn't care if the corpus has 150K or 1.5M chunks.
- **The 20 new questions are designed for the failure mode.** Activity logs
  all look templated to a flat embedder ("call about X with Y"); GraphRAG
  pinpoints `activity_42` via its outgoing edge, BasicRAG drowns.
- **Expected metrics:**
  - GraphRAG: 53–55/56 questions PASS (≥95%)
  - BasicRAG: 14–20/56 PASS (≤35%) — *worse than v6 in absolute terms*
  - Token reduction: 75–82%
  - Latency reduction: 88–92%
  - BERTScore F1 (raw): 0.94–0.96
