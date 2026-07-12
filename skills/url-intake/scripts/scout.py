#!/usr/bin/env python3
"""Scout — URL-first intake for LaunchReel.

Given a product URL, Scout does all the research the customer would otherwise
have to do by hand:

  1. Linkup POST /v1/fetch   -> clean page markdown (page.md) + extracted image
                                URLs (images.json).
  2. Linkup POST /v1/search  -> a structured strategist brief (brief.json):
                                {productName, oneLiner, category, audience,
                                 keyFeatures[], socialProof[], tone,
                                 brandAdjectives[]}.
  3. agent-browser           -> real UI screenshots (desktop hero 1440x900,
                                full page, mobile 390x844). These are the
                                Product Tour scene assets — real UI never goes
                                through gen-video (see AGENTS.md pipeline
                                contract).
  4. manifest.json           -> ties url + fetchedAt + files + brief together
                                for the worker to consume.

Dependency-free (Python stdlib only). Verified live against Linkup on
2026-07-12 — see SKILL.md for the exact request/response shapes.

Usage:
  scout.py --url https://linear.app --out-dir ./out
  scout.py --url https://linear.app --out-dir ./out --depth standard --no-screenshots

Env:
  LINKUP_API_KEY   required (read from env, or auto-loaded from .env/.env.local
                   in the repo root if not already set). Never echoed.

Exit codes:
  0  brief + page markdown were produced (screenshots are best-effort).
  1  a hard failure (missing key, both Linkup calls failed).
"""
import argparse
import glob
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

LINKUP_BASE = "https://api.linkup.so"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Strategist brief schema handed to Linkup /v1/search (outputType=structured).
# structuredOutputSchema must be sent as a JSON *string* whose root is an object.
BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "productName": {"type": "string", "description": "Official product/company name"},
        "oneLiner": {"type": "string", "description": "One-sentence value proposition"},
        "category": {"type": "string", "description": "Product category / market"},
        "audience": {"type": "string", "description": "Who it is for"},
        "keyFeatures": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-6 concrete capabilities, benefit-first",
        },
        "socialProof": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Named customers, logos, metrics, funding, press",
        },
        "tone": {"type": "string", "description": "Brand voice in a few words"},
        "brandAdjectives": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-6 adjectives for the visual/motion direction",
        },
    },
    "required": [
        "productName",
        "oneLiner",
        "category",
        "audience",
        "keyFeatures",
        "tone",
        "brandAdjectives",
    ],
}


def log(msg: str) -> None:
    print(f"[scout] {msg}", flush=True)


# --- env -------------------------------------------------------------------

def load_env_key(name: str) -> str:
    """Return env var `name`; if unset, best-effort parse it out of repo .env files."""
    val = os.environ.get(name)
    if val:
        return val
    for fname in (".env", ".env.local"):
        path = os.path.join(REPO_ROOT, fname)
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                for raw in fh:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    if k.strip() == name:
                        v = v.strip().strip('"').strip("'")
                        if v:
                            return v
        except OSError:
            continue
    return ""


# --- Linkup ----------------------------------------------------------------

def linkup_post(path: str, payload: dict, key: str, timeout: int = 150) -> dict:
    req = urllib.request.Request(
        LINKUP_BASE + path,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def scout_fetch(url: str, key: str) -> dict:
    """POST /v1/fetch -> {markdown, images:[{alt,url}]}."""
    return linkup_post(
        "/v1/fetch",
        {"url": url, "renderJs": True, "extractImages": True},
        key,
    )


def scout_search(url: str, product_hint: str, key: str, depth: str) -> dict:
    """POST /v1/search structured -> the brief object (top-level, no sources)."""
    domain = urllib.parse.urlparse(url).netloc or url
    label = product_hint or domain
    q = (
        f"{label} ({domain}) — what the product does, who it is for, "
        "key features, notable customers or social proof, and the brand's tone of voice. "
        "Answer in English."
    )
    body = {
        "q": q,
        "depth": depth,
        "outputType": "structured",
        # Root object must be a JSON string per the API contract.
        "structuredOutputSchema": json.dumps(BRIEF_SCHEMA),
        "includeSources": False,
    }
    return linkup_post("/v1/search", body, key)


# --- screenshots (agent-browser) -------------------------------------------

def chrome_launch_env() -> tuple[dict, str | None]:
    """Build a subprocess env that makes agent-browser's Chrome launch in a
    container. Chrome needs --no-sandbox where unprivileged user namespaces are
    disabled (Ubuntu 23.10+/most CI/containers); agent-browser has no persistent
    flag for that, so we point AGENT_BROWSER_EXECUTABLE_PATH at a tiny wrapper
    that re-invokes the real Chrome with the safe flags. Returns (env, warning).
    """
    env = dict(os.environ)
    explicit = env.get("AGENT_BROWSER_EXECUTABLE_PATH", "")
    # If the caller already points us at a wrapper (not a raw chrome), trust it.
    if explicit and os.path.basename(explicit) not in ("chrome", "chrome-headless-shell"):
        return env, None
    chrome = explicit or _find_chrome()
    if not chrome:
        return env, "could not locate agent-browser Chrome; relying on default launch"
    fd, wrapper = tempfile.mkstemp(prefix="scout-chrome-", suffix=".sh")
    with os.fdopen(fd, "w") as fh:
        fh.write(
            "#!/usr/bin/env bash\n"
            f'exec "{chrome}" --no-sandbox --disable-dev-shm-usage "$@"\n'
        )
    os.chmod(wrapper, os.stat(wrapper).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    env["AGENT_BROWSER_EXECUTABLE_PATH"] = wrapper
    return env, None


def _find_chrome() -> str | None:
    candidates = sorted(
        glob.glob(os.path.expanduser("~/.agent-browser/browsers/chrome-*/chrome")),
        key=lambda p: p.split("chrome-")[-1],
    )
    return candidates[-1] if candidates else None


def ab(session: str, *args: str, env: dict | None = None, timeout: int = 90) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["agent-browser", *args, "--session", session],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )


def _ok_png(path: str) -> bool:
    # Non-empty file starting with the PNG magic number.
    try:
        if os.path.getsize(path) < 1024:
            return False
        with open(path, "rb") as fh:
            return fh.read(8) == b"\x89PNG\r\n\x1a\n"
    except OSError:
        return False


def take_screenshots(url: str, out_dir: str, session: str) -> tuple[list[dict], list[str]]:
    """Capture desktop hero / full-page / mobile PNGs. Returns (shots, warnings).

    Best-effort: any failure is recorded as a warning, not raised — the worker
    still gets the brief + og:image fallback.
    """
    shots: list[dict] = []
    warnings: list[str] = []

    if not _agent_browser_available():
        warnings.append("agent-browser not on PATH — skipped live screenshots")
        return shots, warnings

    env, env_warn = chrome_launch_env()
    if env_warn:
        warnings.append(env_warn)

    plan = [
        ("desktop-hero", 1440, 900, "2", False, "Desktop hero viewport (above the fold)"),
        ("desktop-full", 1440, 900, "2", True, "Desktop full-page scroll capture"),
        ("mobile", 390, 844, "2", False, "Mobile viewport (iPhone-class)"),
    ]
    wrapper = env.get("AGENT_BROWSER_EXECUTABLE_PATH", "")
    opened = False
    try:
        for name, w, h, scale, full, role in plan:
            vp = ab(session, "set", "viewport", str(w), str(h), scale, env=env)
            if vp.returncode != 0:
                warnings.append(f"{name}: set viewport failed: {vp.stderr.strip()[:160]}")
                continue
            # (Re)load so the new viewport takes effect on layout.
            nav = ab(session, "open", url, env=env, timeout=90) if not opened else ab(session, "reload", env=env, timeout=90)
            opened = opened or nav.returncode == 0
            if nav.returncode != 0:
                warnings.append(f"{name}: navigation failed: {nav.stderr.strip()[:160]}")
                continue
            ab(session, "wait", "2600", env=env, timeout=20)  # let entrance animations / fonts settle
            path = os.path.join(out_dir, f"{name}.png")
            shot_args = ["screenshot"] + (["--full"] if full else []) + [path]
            shot = ab(session, *shot_args, env=env, timeout=90)
            if shot.returncode == 0 and _ok_png(path):
                shots.append({"role": role, "viewport": f"{w}x{h}", "file": f"{name}.png"})
            else:
                warnings.append(f"{name}: screenshot failed: {shot.stderr.strip()[:160]}")
    finally:
        ab(session, "close", env=env, timeout=30)
        if wrapper and wrapper.startswith(tempfile.gettempdir()):
            try:
                os.remove(wrapper)
            except OSError:
                pass
    return shots, warnings


def _agent_browser_available() -> bool:
    try:
        subprocess.run(["agent-browser", "--version"], capture_output=True, timeout=15)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


# --- fallback hero image ---------------------------------------------------

def og_image_fallback(url: str, images: list[dict], out_dir: str) -> tuple[str | None, list[str]]:
    """When live screenshots fail, get a hero still without spending Linkup credits.

    Chain: (1) og:image / twitter:image meta from a direct HTML GET, then
    (2) the first extracted image from Linkup's images.json.
    """
    warnings: list[str] = []
    candidate = _meta_image(url) or (images[0]["url"] if images else None)
    if not candidate:
        warnings.append("no og:image or extracted image available for fallback")
        return None, warnings
    dest = os.path.join(out_dir, "hero-fallback.img")
    try:
        req = urllib.request.Request(candidate, headers={"User-Agent": "Mozilla/5.0 LaunchReelScout"})
        with urllib.request.urlopen(req, timeout=30) as res:
            data = res.read()
            ctype = res.headers.get("Content-Type", "")
        ext = ".png" if "png" in ctype else ".jpg" if ("jpeg" in ctype or "jpg" in ctype) else ".img"
        dest = os.path.join(out_dir, "hero-fallback" + ext)
        with open(dest, "wb") as fh:
            fh.write(data)
        return os.path.basename(dest), warnings
    except (urllib.error.URLError, OSError, ValueError) as e:
        warnings.append(f"fallback image download failed: {str(e)[:160]}")
        return None, warnings


def _meta_image(url: str) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 LaunchReelScout"})
        with urllib.request.urlopen(req, timeout=25) as res:
            html = res.read(400_000).decode("utf-8", "ignore")
    except (urllib.error.URLError, OSError):
        return None
    import re

    for prop in ('property="og:image"', 'name="twitter:image"', 'property="og:image:url"'):
        m = re.search(rf'<meta[^>]+{prop}[^>]+content="([^"]+)"', html, re.I)
        if not m:
            m = re.search(rf'<meta[^>]+content="([^"]+)"[^>]+{prop}', html, re.I)
        if m:
            return urllib.parse.urljoin(url, m.group(1))
    return None


# --- main ------------------------------------------------------------------

def domain_placeholder(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc or url
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    stem = host.split(".")[0] if "." in host else host
    return stem.replace("-", " ").title() if stem else "Untitled"


def main() -> int:
    ap = argparse.ArgumentParser(description="Scout — URL-first intake for LaunchReel")
    ap.add_argument("--url", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--depth", default="standard", choices=["standard", "deep"],
                    help="Linkup search depth (deep reserved for paid tiers)")
    ap.add_argument("--no-screenshots", action="store_true",
                    help="skip agent-browser; still emit brief + og:image fallback")
    ap.add_argument("--session", default=None, help="agent-browser session name (default derived from out-dir)")
    args = ap.parse_args()

    key = load_env_key("LINKUP_API_KEY")
    if not key:
        log("ERROR: LINKUP_API_KEY not set (env or .env)")
        return 1

    url = args.url.strip()
    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    session = args.session or ("scout-" + os.path.basename(out_dir.rstrip("/")) or "scout")
    fetched_at = datetime.now(timezone.utc).isoformat()

    manifest: dict = {
        "url": url,
        "fetchedAt": fetched_at,
        "files": {},
        "screenshots": [],
        "warnings": [],
    }

    # 1. fetch -------------------------------------------------------------
    images: list[dict] = []
    page_ok = False
    try:
        t0 = time.time()
        fetched = scout_fetch(url, key)
        markdown = fetched.get("markdown", "") or ""
        images = [im for im in fetched.get("images", []) if isinstance(im, dict) and im.get("url")]
        with open(os.path.join(out_dir, "page.md"), "w", encoding="utf-8") as fh:
            fh.write(markdown)
        with open(os.path.join(out_dir, "images.json"), "w", encoding="utf-8") as fh:
            json.dump(images, fh, indent=2)
        manifest["files"]["page"] = "page.md"
        manifest["files"]["images"] = "images.json"
        manifest["pageMarkdownChars"] = len(markdown)
        manifest["imageCount"] = len(images)
        page_ok = len(markdown) > 0
        log(f"fetch ok: {len(markdown)} md chars, {len(images)} images ({time.time()-t0:.1f}s)")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as e:
        manifest["warnings"].append(f"fetch failed: {str(e)[:200]}")
        log(f"fetch FAILED: {e}")

    # 2. search (strategist brief) ----------------------------------------
    brief: dict = {}
    try:
        t0 = time.time()
        brief = scout_search(url, "", key, args.depth)
        # Guarantee a productName even if the model omitted it.
        if not brief.get("productName"):
            brief["productName"] = domain_placeholder(url)
        with open(os.path.join(out_dir, "brief.json"), "w", encoding="utf-8") as fh:
            json.dump(brief, fh, indent=2)
        manifest["files"]["brief"] = "brief.json"
        manifest["brief"] = {
            "productName": brief.get("productName"),
            "oneLiner": brief.get("oneLiner"),
            "category": brief.get("category"),
        }
        log(f"search ok: {brief.get('productName')!r} ({time.time()-t0:.1f}s)")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as e:
        manifest["warnings"].append(f"search failed: {str(e)[:200]}")
        log(f"search FAILED: {e}")

    # 3. screenshots -------------------------------------------------------
    if not args.no_screenshots:
        shots, shot_warn = take_screenshots(url, out_dir, session)
        manifest["screenshots"] = shots
        manifest["warnings"].extend(shot_warn)
        for s in shots:
            log(f"screenshot ok: {s['file']} ({s['viewport']})")
    else:
        manifest["warnings"].append("screenshots skipped (--no-screenshots)")

    # 3b. fallback hero if we got no live screenshots ----------------------
    if not manifest["screenshots"]:
        fb, fb_warn = og_image_fallback(url, images, out_dir)
        manifest["warnings"].extend(fb_warn)
        if fb:
            manifest["files"]["heroFallback"] = fb
            log(f"hero fallback saved: {fb}")

    # 4. manifest ----------------------------------------------------------
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    log(f"manifest written -> {os.path.join(out_dir, 'manifest.json')}")

    # Success = we produced the load-bearing outputs (brief and/or page).
    if brief or page_ok:
        return 0
    log("ERROR: both Linkup fetch and search failed — nothing produced")
    return 1


if __name__ == "__main__":
    sys.exit(main())
