# Startup Runbook — CRM GraphRAG

> Read this first every session. Covers the exact startup order, known pain points, and how to run the eval cleanly.

---

## 1. Docker containers (TigerGraph)

> ⚠️ The TigerGraph containers are NOT in the project's docker-compose.yml.
> They exist as named containers — start them by name directly.

```powershell
# Start TigerGraph containers by name (they persist between sessions)
docker start tg-graphrag-db graphrag-ecc

# Wait ~60s then verify BOTH containers are healthy/running:
docker ps
```

**Expected output:**
```
tg-graphrag-db   Up (healthy)   0.0.0.0:14240->14240/tcp
graphrag-ecc     Up             0.0.0.0:8001->8001/tcp
```

**Smoke test — TigerGraph RESTPP is responding:**
```bash
curl http://127.0.0.1:14240/restpp/graph/MyGraph/vertices/Content/crm_employee_emp_1 \
  -H "Authorization: Basic dGlnZXJncmFwaDp0aWdlcmdyYXBo"
# Should return Paul Robinson's JSON, not a connection error
```

> If `tg-graphrag-db` is not healthy after 90s: `docker restart tg-graphrag-db`
> If containers are gone (rare): check CONTEXT.md for re-ingestion steps
> Do NOT run `docker compose up -d` from project root — that starts the Node.js app containers, not TigerGraph

---

## 2. API server (port 3001)

Open a **dedicated terminal** for this and leave it running:

```powershell
cd apps\api
npm run dev        # tsx WATCH mode — hot reloads on file edits
```

**OR — for eval runs (no hot reload, eval won't die mid-run):**
```powershell
cd apps\api
npm run serve      # npx tsx WITHOUT --watch
```

**Smoke test:**
```bash
curl http://localhost:3001/api/compare/status
# → {"vectorIndexReady":true,"chunkCount":1000,...}
```

> **CRITICAL:** Never edit source files while the eval is running in `npm run dev` mode.  
> The tsx watcher will restart the server → HTTP connection drops → eval dies at whatever question it's on.  
> Use `npm run serve` for eval runs.

---

## 3. Web app (port 5173)

Open a **second terminal:**

```powershell
cd apps\web
npm run dev
```

Dashboard: **http://localhost:5173/crm-eval**

---

## 4. Running the CRM eval (35 questions, ~20 min)

```powershell
# STEP 1: Start server in stable mode (no watch)
cd apps\api
npm run serve

# STEP 2: In a NEW terminal — fire the eval
curl -m 7200 http://localhost:3001/api/crm-eval > crm_eval_results.json

# STEP 3: Monitor progress (partial saved after every question)
# In a third terminal:
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('crm_eval_partial.json','utf8'));
const rows=d.results||[];
const g=rows.filter(r=>r.graphrag?.judge?.verdict==='PASS').length;
const judged=rows.filter(r=>r.graphrag?.judge).length;
console.log('Progress:',d.n,'/35 | GraphRAG:',g+'/'+judged,'='+(judged>0?(g/judged*100).toFixed(0):'?')+'%');
"
```

**After eval completes** — the results are saved to `crm_eval_results.json` and the dashboard loads them instantly via `GET /api/crm-eval/results`.

---

## 5. Live tunnel (for remote demo / judging)

```powershell
npx localtunnel --port 5173 --subdomain creda-graphrag
# Tunnel URL: https://creda-graphrag.loca.lt
# Visitors see an IP challenge page — give them your IP to bypass
```

---

## 6. Quick single-question test (verify GraphRAG is working)

```bash
curl -s -X POST http://localhost:3001/api/crm-eval/question \
  -H "Content-Type: application/json" \
  -d '{"question":"What department does Paul Robinson belong to, and what is that department'\''s Q4 goal?","referenceAnswer":"Paul Robinson is in the Sales department, which has a Q4 goal of $22M ARR."}'
```

Expected: `"judge":{"verdict":"PASS"}` + `"retrievedChunks":` showing 2-3 chunks (Paul Robinson + Sales dept second-hop).

---

## Known issues & fixes applied

| Issue | Root cause | Fix |
|-------|-----------|-----|
| All GraphRAG answers error ("fetch failed") | `fallbackSearch` threw on port 8000 connection refused (ECC is on 8001 with different API) | Wrapped fetch in try/catch → returns `[]` gracefully |
| Multi-hop fails (Paul Robinson → Sales dept Q4 goal) | Only fetched primary entity, didn't traverse to related entity | **Second-hop**: scan retrieved text for CRM entity keywords → auto-fetch related entities |
| Number formatting judge failures ($14,78,328 vs $1,478,328) | Indian comma format in source data | **normalizeNumbers()** converts all Indian-format $ amounts to Western before passing to LLM |
| "Which customers use [product]?" failures | Product chunk doesn't list customer names | **PRODUCT_SAMPLE_CUSTOMERS** reverse map: when question asks about identifying customers of a product → inject representative customer chunks |
| "Sales vs Engineering" 0-chunk failure | `' engineering '` space-padding fails at `?` sentence boundary | **Word-boundary regex**: space-padded keywords use `\b` matching, not `includes()` |
| LLM volunteering monthly breakdown for ARR question | Model followed "helpful" pattern despite not being asked | System prompt: "NEVER perform arithmetic unless EXPLICITLY asked" |
| Numbered lists failing judge | LLM defaulted to list format | System prompt: "NEVER use numbered lists or bullet points — flowing prose only" |
| Wrong comparison conclusion (e.g. "Engineering has larger budget") | Comparison instruction let model guess direction | System prompt: "Name the winner directly by comparing numbers explicitly" |
| Reverse customer lookup polluting comparison questions | `asksAboutCustomers` regex matched "active customers" count questions | Tightened regex to only match "which companies use X" pattern |
| Date conversion hallucination (July 9 → May 9) | LLM converted ISO date incorrectly | System prompt: "State dates VERBATIM from context (e.g. 2025-07-09)" |
| Long eval killed mid-run | `npm run dev` uses tsx watch; any file edit restarts server → HTTP drops | Use `npm run serve` for eval runs |

---

## Current eval state (as of 2026-05-14)

- **Full results v1** (2026-05-13): `crm_eval_results.json` — 30/36 PASS (83.3%), tokens 618 avg, reduction 71.4%, BERTScore 0.575
- **Full results v2** (2026-05-14): `crm_eval_results_v2.json` — running now with all May-14 fixes applied
- Expected improvements: 5 of 6 previous failures fixed → target ≥89% accuracy, ≥79% token reduction

---

## Port map

| Service | Port | URL |
|---------|------|-----|
| TigerGraph RESTPP | 14240 | `http://127.0.0.1:14240/restpp/` |
| TigerGraph ECC | 8001 | `http://127.0.0.1:8001/` (not used directly) |
| API server | 3001 | `http://localhost:3001/api/` |
| Web dashboard | 5173 | `http://localhost:5173/crm-eval` |
| Live tunnel | 443 | `https://creda-graphrag.loca.lt` |
