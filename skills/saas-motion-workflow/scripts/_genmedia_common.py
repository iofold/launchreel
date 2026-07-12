"""Shared helpers for the gcp-genmedia scripts (stdlib only, no third-party deps).

Two backends are supported for every modality:

  vertex  -- aiplatform.googleapis.com. PREFERRED: this is the only path that
             draws down GCP credits. Needs a cloud-platform access token
             (gcloud auth print-access-token) + project id + region.
  gemini  -- generativelanguage.googleapis.com. Fallback: proves the models
             work but is billed to the Gemini API account and does NOT touch
             GCP credits. Needs GEMINI_API_KEY (or GOOGLE_API_KEY).

Backend resolution order (override with --backend or GENMEDIA_BACKEND):
  1. explicit vertex  -> require a token; error out if none.
  2. explicit gemini  -> require GEMINI_API_KEY.
  3. auto (default)   -> use vertex if a cloud-platform token is obtainable,
                         else fall back to gemini.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta"


def env(*names, default=None):
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return default


# ---------------------------------------------------------------- auth --------
def gemini_key():
    k = env("GEMINI_API_KEY", "GOOGLE_API_KEY")
    if not k:
        die("no GEMINI_API_KEY / GOOGLE_API_KEY in env for the gemini backend")
    return k


def vertex_token(required=True):
    """Return a cloud-platform access token via gcloud, or None.

    Honors GOOGLE_OAUTH_ACCESS_TOKEN if already exported. Otherwise shells out to
    `gcloud auth print-access-token` (optionally for GENMEDIA_GCLOUD_ACCOUNT).
    A metadata/compute-default token that lacks the cloud-platform scope will be
    rejected by aiplatform at call time (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT) --
    we surface that error verbatim so the fix is obvious.
    """
    tok = env("GOOGLE_OAUTH_ACCESS_TOKEN")
    if tok:
        return tok
    cmd = ["gcloud", "auth", "print-access-token"]
    acct = env("GENMEDIA_GCLOUD_ACCOUNT")
    if acct:
        cmd += ["--account", acct]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        if required:
            die(f"could not run gcloud for a vertex token: {e}")
        return None
    if out.returncode != 0:
        if required:
            die("gcloud auth print-access-token failed:\n" + out.stderr.strip())
        return None
    return out.stdout.strip()


def vertex_project():
    p = env("GENMEDIA_PROJECT", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT")
    if p:
        return p
    try:
        out = subprocess.run(["gcloud", "config", "get-value", "project"],
                             capture_output=True, text=True, timeout=30)
        p = (out.stdout or "").strip()
        if p and p != "(unset)":
            return p
    except Exception:
        pass
    return None


def token_has_cloud_scope(tok):
    """True if the access token carries the cloud-platform (or aiplatform) scope.

    A GCE metadata / compute-default token often lacks it and would 403 on
    aiplatform with ACCESS_TOKEN_SCOPE_INSUFFICIENT; auto-mode uses this to skip
    a doomed vertex attempt and fall back to gemini.
    """
    if not tok:
        return False
    try:
        st, info = get_json(
            "https://oauth2.googleapis.com/tokeninfo?access_token=" + tok, {}, timeout=15)
        scope = (info or {}).get("scope", "")
        return ("cloud-platform" in scope) or ("aiplatform" in scope)
    except Exception:
        return False


def resolve_backend(requested):
    requested = (requested or env("GENMEDIA_BACKEND") or "auto").lower()
    if requested == "vertex":
        return "vertex"
    if requested == "gemini":
        return "gemini"
    # auto: prefer vertex (credit-eligible) only if we can get a properly-scoped
    # token; otherwise fall back to gemini so we don't 403 at call time.
    tok = vertex_token(required=False)
    if tok and token_has_cloud_scope(tok):
        return "vertex"
    return "gemini"


def vertex_region():
    return env("GENMEDIA_REGION", "GOOGLE_CLOUD_LOCATION", default="us-central1")


# ---------------------------------------------------------------- http --------
def _req(url, method="GET", headers=None, body=None, timeout=180):
    data = None
    if body is not None:
        data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def post_json(url, headers, body, timeout=180):
    h = dict(headers or {}); h.setdefault("Content-Type", "application/json")
    status, raw = _req(url, "POST", h, body, timeout)
    return status, _maybe_json(raw)


def get_json(url, headers, timeout=180):
    status, raw = _req(url, "GET", headers, None, timeout)
    return status, _maybe_json(raw)


def get_bytes(url, headers, timeout=300):
    return _req(url, "GET", headers, None, timeout)  # (status, raw bytes)


def _maybe_json(raw):
    try:
        return json.loads(raw)
    except Exception:
        return {"_raw": raw[:600].decode("utf-8", "replace")}


# ------------------------------------------------------------- endpoints ------
def vertex_model_url(project, region, model, verb):
    return (f"https://{region}-aiplatform.googleapis.com/v1/projects/{project}"
            f"/locations/{region}/publishers/google/models/{model}:{verb}")


def gemini_model_url(model, verb):
    return f"{GEMINI_HOST}/models/{model}:{verb}"


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def apikey_header(key):
    return {"x-goog-api-key": key}


# ---------------------------------------------------------------- misc --------
def save(path, data):
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def die(msg, code=1):
    print("ERROR: " + str(msg), file=sys.stderr)
    sys.exit(code)


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def pcm_to_wav(path, pcm, rate=24000, channels=1, sampwidth=2):
    import wave
    w = wave.open(path, "wb")
    w.setnchannels(channels); w.setsampwidth(sampwidth); w.setframerate(rate)
    w.writeframes(pcm); w.close()
    return len(pcm)


def parse_audio_mime(mime):
    rate, ch = 24000, 1
    for tok in (mime or "").split(";"):
        tok = tok.strip()
        if tok.startswith("rate="):
            try: rate = int(tok.split("=")[1])
            except ValueError: pass
        if tok.startswith("channels="):
            try: ch = int(tok.split("=")[1])
            except ValueError: pass
    return rate, ch


def first_inline(parts):
    """Return (bytes, mimeType) of the first inlineData part, or (None, None)."""
    for p in parts or []:
        d = p.get("inlineData") or p.get("inline_data")
        if d and d.get("data"):
            return base64.b64decode(d["data"]), d.get("mimeType") or d.get("mime_type") or ""
    return None, None
