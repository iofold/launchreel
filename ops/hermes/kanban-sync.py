#!/usr/bin/env python3
"""kanban-sync — DONE-ONLY static ledger of the Convex job book on launchreel-ops.

Host-side, Python stdlib only. One invocation = one idempotent refresh. Not looped
by default (the board is a static ledger); re-run by hand after a batch of status
changes.

Data in:  `npx convex data jobs --format json` (the whole jobs table), from the
          repo root so it picks up the deployment config.
Data out: `docker exec <gateway> hermes kanban --board launchreel-ops ...`

Every job becomes ONE terminal `done` card; the real pipeline status is carried in
the title prefix so the Done column reads as a status ledger:
  delivered                                    -> [DELIVERED]
  awaiting_approval                            -> [NEEDS APPROVAL]
  failed                                       -> [FAILED]
  queued/research/storyboard/voiceover/        -> [IN-FLIGHT: <stage>]
    rendering / awaiting_info (in-flight)

================================  SAFETY  ====================================
Belt AND suspenders, after the 2026-07-12 dispatcher auto-execution incident
(see ops/hermes/README.md "Incident: kanban dispatcher auto-execution"):
  * SUSPENDERS — the gateway's in-process kanban dispatcher is OFF
    (`kanban.dispatch_in_gateway: false` + `auto_decompose: false` in
    $HERMES_HOME/config.yaml). Do NOT re-enable it while this board mirrors
    production.
  * BELT — this ledger writes ONLY terminal `done` cards. `done` is
    non-dispatchable even if dispatch were ever turned back on. `hermes kanban
    create` lands a card in `ready` first, so each card is completed in the same
    pass (sub-second), and a safety net completes anything left non-terminal.
Cards are always UNASSIGNED (the dispatcher skips unassigned tasks — a third
layer). Nothing here ever claims/updates/approves a real job.
=============================================================================

Idempotent: cards match jobs by a ` job:<jobId>` marker; a job that already has a
done card is left alone (its title status prefix may lag until the next refresh).
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

STATUS_PREFIX = {
    "delivered": "[DELIVERED]",
    "awaiting_approval": "[NEEDS APPROVAL]",
    "failed": "[FAILED]",
}
TERMINAL = {"done", "archived"}


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


def title_for(job: dict) -> str:
    status = job["status"]
    prefix = STATUS_PREFIX.get(status, f"[IN-FLIGHT: {status}]")
    product = job.get("productName") or "(untitled)"
    return f"{prefix} {product} — {job.get('tier') or '?'} · job:{job['_id']}"


def main() -> int:
    jobs = load_jobs()
    cards = kb("list", "--json", json_out=True)
    have = {m.group(1) for c in cards if (m := MARKER_RE.search(c.get("title") or ""))}
    live = {j["_id"] for j in jobs}
    n = collections.Counter()

    for job in jobs:
        if job["_id"] in have:
            n["noop"] += 1
            continue
        cid = kb("create", title_for(job), "--json", json_out=True)["id"]  # lands ready
        kb("complete", cid)                                                # -> terminal
        n["created_done"] += 1

    # Reconcile: drop the old manual-mirror cards and any card whose job is gone.
    for c in cards:
        m = MARKER_RE.search(c.get("title") or "")
        if not m:
            kb("archive", c["id"]); n["archived_stray"] += 1
        elif m.group(1) not in live:
            kb("archive", c["id"]); n["archived_orphan"] += 1
    # Invariant: nothing non-terminal may linger (belt).
    for c in kb("list", "--json", json_out=True):
        if c.get("status") not in TERMINAL:
            kb("complete", c["id"]); n["safety_completed"] += 1

    col = collections.Counter(c.get("status") for c in kb("list", "--json", json_out=True))
    print(json.dumps({"jobs": len(jobs), "actions": dict(n), "board": dict(col)}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
