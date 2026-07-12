#!/usr/bin/env python3
"""Email-keyed per-customer profiles for LaunchReel.

Email is the identity key across LaunchReel: Convex (users/jobs/events) is
email-keyed, and the Hermes gateway/worker keeps a richer per-customer profile
doc here — brand brief, tier history, revision count, and tone preferences — so
a returning customer (whether they come back via email, the web app, or a reply)
gets continuity: same brand voice, remembered revisions, no re-asking.

This is a small file-backed stub. One JSON file per customer email under
PROFILES_DIR. It is deliberately dependency-free and safe to call from the
worker (best-effort; callers should not fail a job on a profile write error).

Location (first that applies):
  1. $PROFILES_DIR
  2. $HERMES_HOME/profiles      (the gateway's persisted volume — /opt/data in
                                 the container, so profiles survive restarts)
  3. ~/.launchreel-hermes/profiles

Usage (library):
    from profiles import read_profile, update_profile
    p = read_profile("founder@acme.com")
    update_profile("founder@acme.com", {"tone": "punchy", "tierHistory": ["trailer"]})

Usage (CLI, for pokes):
    python3 profiles.py get founder@acme.com
    python3 profiles.py set founder@acme.com '{"tone":"punchy"}'
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import time
from typing import Any


def _profiles_dir() -> str:
    d = os.environ.get("PROFILES_DIR")
    if not d:
        home = os.environ.get("HERMES_HOME")
        base = home if home else os.path.expanduser("~/.launchreel-hermes")
        d = os.path.join(base, "profiles")
    os.makedirs(d, exist_ok=True)
    return d


def _slug(email: str) -> str:
    """Stable, readable, filesystem-safe filename stem for an email."""
    return re.sub(r"[^a-z0-9]+", "_", email.strip().lower()).strip("_") or "unknown"


def _path(email: str) -> str:
    return os.path.join(_profiles_dir(), _slug(email) + ".json")


def _skeleton(email: str) -> dict[str, Any]:
    return {
        "email": email.strip().lower(),
        "brandBrief": None,     # Scout's structured brief for their latest job
        "tierHistory": [],      # ["teaser", "trailer", ...] in order
        "revisionCount": 0,     # revisions requested across all jobs
        "tone": None,           # learned/declared voice: "punchy" | "corporate" | ...
        "brandAdjectives": [],  # e.g. ["bold", "playful"]
        "notes": None,          # free-form operator/gateway notes
        "createdAt": None,
        "updatedAt": None,
    }


def read_profile(email: str) -> dict[str, Any]:
    """Return the customer's profile, or a fresh skeleton if none exists yet."""
    path = _path(email)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict):
                return {**_skeleton(email), **data}
        except (OSError, ValueError):
            pass  # corrupt/unreadable -> fall back to a fresh skeleton
    return _skeleton(email)


def update_profile(email: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Shallow-merge `patch` into the profile and persist it atomically.

    Convenience semantics for the two accumulating fields:
      - `tierHistory`: a str or list in the patch is appended (not replaced).
      - `revisionCount`: pass {"revisionCount": "+1"} to increment.
    Everything else overwrites. Returns the merged profile.
    """
    now = int(time.time() * 1000)
    prof = read_profile(email)
    prof["createdAt"] = prof.get("createdAt") or now

    for k, v in (patch or {}).items():
        if k == "tierHistory" and v is not None:
            add = v if isinstance(v, list) else [v]
            prof["tierHistory"] = list(prof.get("tierHistory") or []) + list(add)
        elif k == "revisionCount" and v == "+1":
            prof["revisionCount"] = int(prof.get("revisionCount") or 0) + 1
        else:
            prof[k] = v
    prof["updatedAt"] = now

    path = _path(email)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(prof, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, path)  # atomic
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return prof


def _main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "get":
        print(json.dumps(read_profile(argv[1]), indent=2))
        return 0
    if len(argv) >= 3 and argv[0] == "set":
        patch = json.loads(argv[2])
        print(json.dumps(update_profile(argv[1], patch), indent=2))
        return 0
    print("usage: profiles.py get <email> | set <email> '<json-patch>'")
    return 2


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
