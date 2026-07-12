#!/usr/bin/env python3
"""Operator tool: record a (UPI) payment against a job — the proof-minute path.

Usage:
  python3 agent/record-payment.py <jobId> --amount 999 [--method upi_qr] [--evidence "UPI ref 4521..."]

Resolves the job's owner via the guarded /api/worker/job endpoint, then records
the payment through `npx convex run orders:recordPayment` (deploy key auth from
.env.local), which also logs the payment_recorded event the mentors verify.
Simulation note (buildathon): while the QR is the free-offer placeholder, use
--evidence "SIMULATED — free-offer QR" so the demo ledger stays honest.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env_from(path: str) -> None:
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v.strip('"'))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobId")
    ap.add_argument("--amount", type=int, required=True, help="INR")
    ap.add_argument("--method", default="upi_qr", choices=["upi_qr", "razorpay"])
    ap.add_argument("--evidence", default="SIMULATED — free-offer QR")
    a = ap.parse_args()

    env_from(os.path.join(REPO, ".env"))
    env_from(os.path.join(REPO, "ops", "hermes", ".env"))
    base = os.environ.get("CONVEX_SITE_URL", "").rstrip("/")
    key = os.environ.get("WORKER_KEY", "")
    if not base or not key:
        sys.exit("CONVEX_SITE_URL / WORKER_KEY missing")

    req = urllib.request.Request(
        base + "/api/worker/job",
        data=json.dumps({"jobId": a.jobId}).encode(),
        headers={"Content-Type": "application/json", "X-Worker-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        job = json.load(res)["job"]
    if not job or not job.get("userId"):
        sys.exit("job has no owner (unclaimed seed?) — claim it first, then record payment")

    args = json.dumps(
        {"userId": job["userId"], "jobId": a.jobId, "amountInr": a.amount,
         "method": a.method, "evidence": a.evidence}
    )
    out = subprocess.run(
        ["npx", "convex", "run", "orders:recordPayment", args],
        cwd=REPO, capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        sys.exit(f"convex run failed: {out.stderr.strip()[-400:]}")
    print(f"recorded ₹{a.amount} ({a.method}) for {job.get('productName')} — {out.stdout.strip()}")
    print("verify: Convex dashboard → payments table / events payment_recorded")


if __name__ == "__main__":
    main()
