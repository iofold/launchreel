// Shared helpers for the openai-genai-assets scripts.
// Dependency-free: runs on `bun run` with no npm install. Only needs OPENAI_API_KEY in env.

export const API = "https://api.openai.com/v1";

// Verified 2026-07-12 against OpenAI's published API pricing.
// gpt-image models are token-priced; TTS bills text-in + audio-out tokens.
export const PRICING = {
  "gpt-image-2":   { textIn: 5 / 1e6, imageIn: 8 / 1e6, imageInCached: 2 / 1e6, imageOut: 30 / 1e6 },
  "gpt-image-1.5": { textIn: 5 / 1e6, imageIn: 8 / 1e6, imageInCached: 2 / 1e6, imageOut: 30 / 1e6 },
  "gpt-image-1":   { textIn: 5 / 1e6, imageIn: 10 / 1e6, imageInCached: 2.5 / 1e6, imageOut: 40 / 1e6 },
  // TTS: /audio/speech returns NO usage object, so cost is estimated from audio duration.
  "gpt-4o-mini-tts": { perMinute: 0.015 }, // = $0.60/1M text-in + $12/1M audio-out tokens
  "tts-1":    { perMChar: 15 },  // legacy, char-billed
  "tts-1-hd": { perMChar: 30 },  // legacy, char-billed
} as const;

export function getKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) {
    fail("OPENAI_API_KEY is not set. Export it (never hardcode) before running.");
  }
  return k;
}

// Minimal --flag value / --flag=value parser. Booleans supported via presence.
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) { out[key] = true; }
      else { out[key] = next; i++; }
    } else rest.push(a);
  }
  if (rest.length) out._ = rest.join(" ");
  return out;
}

export function fail(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

export function log(msg: string) {
  process.stderr.write(msg + "\n");
}

// Compute image cost from the usage object the images endpoints return.
export function imageCost(model: string, usage: any): number {
  const p = (PRICING as any)[model] ?? PRICING["gpt-image-2"];
  const d = usage?.input_tokens_details ?? {};
  const textIn = d.text_tokens ?? usage?.input_tokens ?? 0;
  const imageIn = d.image_tokens ?? 0;
  const imageOut = usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens ?? 0;
  return textIn * p.textIn + imageIn * p.imageIn + imageOut * p.imageOut;
}

export function usd(n: number): string {
  return "$" + n.toFixed(4);
}

// POST JSON, return parsed JSON. Surfaces API errors clearly.
export async function postJSON(path: string, key: string, body: unknown) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { fail(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 500)}`); }
  if (!res.ok || json.error) fail(`HTTP ${res.status}: ${JSON.stringify(json.error ?? json, null, 2)}`);
  return { json, ms };
}

// POST multipart/form-data (for image edits), return parsed JSON.
export async function postForm(path: string, key: string, form: FormData) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { fail(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 500)}`); }
  if (!res.ok || json.error) fail(`HTTP ${res.status}: ${JSON.stringify(json.error ?? json, null, 2)}`);
  return { json, ms };
}

// Save a base64 image payload from an images response to disk.
export async function saveB64Image(json: any, outPath: string): Promise<number> {
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) fail(`No image data in response: ${JSON.stringify(json).slice(0, 300)}`);
  const bytes = Buffer.from(b64, "base64");
  await Bun.write(outPath, bytes);
  return bytes.length;
}
