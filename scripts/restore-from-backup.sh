#!/usr/bin/env bash
# Disaster recovery: restore TigerGraph gstore from a verified backup tar.
# Validated pattern: stop -> swap gstore -> CLEAR journal (kafka) -> extract -> start -> resume.
# Clearing kafka is REQUIRED so GPE boots from the restored checkpoint instead of
# replaying post-backup deltas onto stale data (that mismatch caused prior corruption).
#
# Usage: bash scripts/restore-from-backup.sh gstore_partial_YYYYMMDD_HHMMSS.tgz
set -euo pipefail
BK="${1:?usage: restore-from-backup.sh <backup_tar_name.tgz>}"
DATA=/home/tigergraph/tigergraph/data
HOSTBK="/c/Users/vishn/tg_wal_backups"
DE() { docker exec -u tigergraph tg-graphrag-db bash -lc "$1"; }
TS=$(date +%s)

echo "[1/7] Ensure backup present in container..."
if ! docker exec tg-graphrag-db bash -lc "test -f $DATA/$BK"; then
  echo "  copying $BK from host..."
  docker cp "$HOSTBK/$BK" "tg-graphrag-db:$DATA/$BK"
fi
echo "[2/7] Verify archive integrity..."
docker exec tg-graphrag-db bash -lc "cd $DATA && tar -tzf $BK >/dev/null" && echo "  READABLE" || { echo "  CORRUPT ARCHIVE -- ABORT"; exit 1; }

echo "[3/7] Stop all services (clean)..."
DE "~/tigergraph/app/cmd/gadmin stop all -y" | tail -1

echo "[4/7] Quarantine current gstore + clear journal..."
DE "cd $DATA && mv gstore gstore_bad_$TS 2>/dev/null || true; mv kafka kafka_bad_$TS 2>/dev/null || true; mv kafkastrm-ll kafkastrm_bad_$TS 2>/dev/null || true; echo done"

echo "[5/7] Extract backup..."
DE "cd $DATA && tar -xzf $BK && echo extracted"

echo "[6/7] Start all services + wait GPE..."
DE "~/tigergraph/app/cmd/gadmin start all" | tail -1
for i in $(seq 1 30); do
  s=$(DE "~/tigergraph/app/cmd/gadmin status gpe 2>/dev/null | grep -oE 'Online|Down' | head -1" || true)
  [ "$s" = "Online" ] && { echo "  GPE Online after ~$((i*6))s"; break; }
  sleep 6
done

echo "[7/7] Verify chunk count + resume embedding..."
curl -s -u tigergraph:tigergraph --max-time 60 'http://127.0.0.1:14240/restpp/graph/MyGraph/vertices/DocumentChunk?count_only=true' 2>/dev/null | grep -oE '"count":[0-9]+' || true
# wait graphrag/ecc then resume
for i in $(seq 1 20); do e=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8001/docs 2>/dev/null || echo 000); g=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8000/ 2>/dev/null || echo 000); [ "$e" = "200" ] && [ "$g" = "200" ] && break; sleep 5; done
curl -s -u tigergraph:tigergraph --max-time 60 "http://127.0.0.1:8000/MyGraph/graphrag/forceupdate" 2>/dev/null | head -c 80
echo ""
echo "RESTORE COMPLETE. Then relaunch watcher: bash scripts/watch-embed4.sh &"
