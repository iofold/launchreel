#!/usr/bin/env python3
"""kanban-sync — DISPLAY-ONLY mirror of the Convex job book onto launchreel-ops.

Host-side, Python stdlib only. One invocation = one idempotent sync pass; the
lr-kanban-sync tmux loop runs it every 60s for a live board.

Data in:  `npx convex data jobs --format json` (the whole jobs table), from the
          repo root so it picks up the deployment config.
Data out: `docker exec <gateway> hermes kanban --board launchreel-ops ...`

Columns (status -> board column, status carried in the title prefix):
  delivered                                   -> done      [DELIVERED]
  awaiting_approval                           -> blocked   [NEEDS APPROVAL]
  failed                                      -> blocked   [FAILED]
  queued/research/storyboard/voiceover/       -> blocked   [IN-FLIGHT: <stage>]
    rendering  (in-flight)

================================  SAFETY  ====================================
This mirror is DISPLAY-ONLY and is safe ONLY while the gateway's kanban
dispatcher is OFF. On 2026-07-12 the in-gateway dispatcher auto-ran mirror cards
as agent tasks (auto_decompose rewrote titles + assigned them, dispatch spawned
runners) and approved 16 real jobs. The fix is config `kanban.dispatch_in_gateway:
false` + `auto_decompose: false` in $HERMES_HOME/config.yaml (see ops/hermes/
README.md "Incident: kanban dispatcher auto-execution"). Do NOT re-enable
gateway dispatch while this board mirrors production. Cards are always UNASSIGNED
(the dispatcher skips unassigned tasks even if it is ever re-enabled), created
then immediately moved out of `ready`, and a safety net blocks anything left
runnable. Nothing here ever claims/updates/approves a real job.
=============================================================================

Idempotent: cards match jobs by a ` job:<jobId>` marker; a steady-state pass
(no job changed status bucket) makes zero mutations.
"""
from __future__ import annotations

import collections
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GATEWAY = os.environ.get("LR_GATEWAY_CONTAINER", "launchreel-gateway")
BOARD = os.environ.get("LR_KANBAN_BOARD", "launchreel-ops")
MARKER_RE = re.compile(r"job:([a-z0-9]+)")

# status -> (title prefix, block reason) for the blocked bucket
HUMAN_GATED = {
    "awaiting_approval": ("[NEEDS APPROVAL]", "Awaiting customer approval"),
    "failed": ("[FAILED]", "Render failed — needs attention"),
}
INFLIGHT = {"queued", "research", "storyboard", "voiceover", "rendering"}
RUNNABLE = {"ready", "todo", "running", "review", "scheduled", "triage"}


def kb(*args: str, json_out: bool = False):
    cmd = ["docker", "exec", GATEWAY, "hermes", "kanban", "--board", BOARD, *args]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"kanban {' '.join(args[:2])} failed: {res.stderr.strip()}")
    return json.loads(res.stdout) if json_out else res.stdout.strip()


def load_jobs() -> list[dict]:
    res = subprocess.run(
        ["npx", "convex", "data", "jobs", "--format", "json", "--limit", "1000"],
        capture_output=True, text=True, cwd=str(REPO_ROOT), timeout=120,
    )
    if res.returncode != 0:
        raise RuntimeError(f"convex data jobs failed: {res.stderr.strip()}")
    return json.loads(res.stdout)


def spec_for(job: dict) -> dict:
    status = job["status"]
    product = job.get("productName") or "(untitled)"
    tier = job.get("tier") or "?"
    if status == "delivered":
        column, prefix, reason = "done", "[DELIVERED]", None
    elif status in HUMAN_GATED:
        prefix, reason = HUMAN_GATED[status]
        column = "blocked"
    else:
        stage = status if status in INFLIGHT else status
        column, prefix = "blocked", f"[IN-FLIGHT: {stage}]"
        reason = f"In progress — {stage} (autonomous pipeline; no action needed)"
    title = f"{prefix} {product} — {tier} · job:{job['_id']}"
    return {"column": column, "title": title, "reason": reason}


def main() -> int:
    jobs = load_jobs()
    cards = kb("list", "--json", json_out=True)
    by_job, strays = {}, []
    for c in cards:
        m = MARKER_RE.search(c.get("title") or "")
        (by_job.__setitem__(m.group(1), c) if m else strays.append(c))

    live = {j["_id"] for j in jobs}
    n = collections.Counter()
    for job in jobs:
        spec = spec_for(job)
        card = by_job.get(job["_id"])
        if card is None:
            cid = kb("create", spec["title"], "--json", json_out=True)["id"]  # lands ready
            if spec["column"] == "done":
                kb("complete", cid); n["created_done"] += 1
            else:
                kb("block", cid, "--kind", "needs_input", spec["reason"]); n["created_blocked"] += 1
        else:
            cur = card.get("status")
            if spec["column"] == "done" and cur != "done":
                kb("complete", card["id"]); n["to_done"] += 1
            elif spec["column"] == "blocked" and cur != "blocked":
                kb("block", card["id"], "--kind", "needs_input", spec["reason"]); n["to_blocked"] += 1
            else:
                n["noop"] += 1

    for c in strays:                       # old manual-mirror cards, no marker
        kb("archive", c["id"]); n["archived_stray"] += 1
    for jid, c in by_job.items():          # job removed from the book
        if jid not in live:
            kb("archive", c["id"]); n["archived_orphan"] += 1
    for c in kb("list", "--json", json_out=True):   # invariant: nothing dispatchable
        if c.get("status") in RUNNABLE:
            kb("block", c["id"], "--kind", "needs_input", "pinned out of dispatch by kanban-sync")
            n["safety_blocked"] += 1

    col = collections.Counter(c.get("status") for c in kb("list", "--json", json_out=True))
    print(json.dumps({"jobs": len(jobs), "actions": dict(n), "board": dict(col)}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 — never hard-crash the loop; the timer retries
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
