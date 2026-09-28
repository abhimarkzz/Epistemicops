#!/usr/bin/env bash
#
# Repeatable EpistemicOps memory demo.
#
# Runs the cold -> warm -> baseline -> compare sequence against a already-running
# stack (Hindsight + backend). It talks to the backend over HTTP/SSE only; it never
# touches ground truth or fabricates results.
#
# Prereqs:
#   1. docker compose up -d           (Hindsight on :8888)
#   2. backend running on :8000        (uvicorn app.main:app)
#   3. A working LLM key in backend/.env:
#        - GROQ_API_KEY=...  (free, recommended)   or
#        - a Gemini key with available free-tier quota
#
# Usage:  ./scripts/demo.sh
set -euo pipefail

BACKEND="${BACKEND:-http://127.0.0.1:8000}"
COLD="${COLD:-inc-001}"
WARM="${WARM:-inc-003}"   # related bad_deploy incident

say() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

say "0. Health"
curl -s "$BACKEND/health" | python3 -m json.tool

say "1. Reset memory bank (clean slate)"
curl -s -X DELETE "$BACKEND/api/memory/bank" | python3 -m json.tool

run() {   # run <incident> <query-string> <label>
  say "$3  ($1${2:+?$2})"
  curl -sN -X POST "$BACKEND/api/investigate/$1${2:+?$2}" \
    | grep '^data:' | sed 's/^data: //' \
    | python3 -c '
import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    ev=json.loads(line)
    d=ev.get("data",{})
    t=ev.get("event")
    if t in ("run_started","memory_result","memory_skipped","diagnosis_completed","run_failed","postmortem_created","run_completed"):
        print(f"  [{t}] " + json.dumps(d)[:160])
'
}

run "$COLD" "" "2. COLD run (learns, retains to Hindsight)"
say "3. Let Hindsight retain/consolidate"; sleep 20
run "$WARM" "" "4. WARM run (recalls prior memory)"
run "$WARM" "baseline=true" "5. BASELINE run (memory skipped)"

say "6. Recent runs (compare the real records in the UI)"
curl -s "$BACKEND/api/runs?limit=5" | python3 -c '
import json,sys
for r in json.load(sys.stdin):
    print(f"  #{r[\"run_id\"]} {r[\"incident_id\"]:8} {r[\"mode\"]:8} mem={r[\"memory_used\"]!s:5} status={r[\"status\"]}")
'
say "Done. Open http://localhost:5173 and click 'Compare last 2'."
