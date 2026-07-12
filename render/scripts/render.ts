/**
 * LaunchReel deterministic renderer.
 *
 *   node --import tsx scripts/render.ts \
 *     --storyboard storyboards/launchreel.json \
 *     --assets    assets/launchreel \
 *     --out       out/launchreel \
 *     [--slug launchreel] [--serve-url <bundleDir>] [--reuse-bundle] \
 *     [--poster-frame N] [--concurrency N] [--muted] [--bundle-only]
 *
 * storyboard.json in  ->  <out>/trailer.mp4 + <out>/poster.png (+ prints a JSON summary).
 * Asset paths in the storyboard are resolved relative to --assets, copied into the
 * Remotion public dir, and rewritten to staticFile()-relative paths. Non-interactive.
 */
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, renderStill, ensureBrowser } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENTRY = path.join(ROOT, "src", "index.ts");
const BUNDLE_MARKER = path.join(ROOT, ".bundle", "serve-url.txt");

// ---------- args ----------
function parseArgs(argv: string[]) {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) a[key] = true;
      else { a[key] = next; i++; }
    }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const log = (...m: unknown[]) => console.error("[render]", ...m);

function kebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "job";
}

// ---------- asset staging: copy --assets into public/jobs/<slug>, rewrite paths ----------
function stageAssets(sb: any, assetsDir: string | null, slug: string) {
  const jobRel = path.posix.join("jobs", slug);
  const jobAbs = path.join(PUBLIC_DIR, "jobs", slug);
  if (assetsDir && fs.existsSync(assetsDir)) {
    fs.rmSync(jobAbs, { recursive: true, force: true });
    fs.mkdirSync(jobAbs, { recursive: true });
    fs.cpSync(assetsDir, jobAbs, { recursive: true });
    log(`staged assets ${assetsDir} -> public/${jobRel}`);
  }
  const resolve = (p?: string): string | undefined => {
    if (!p) return undefined;
    if (/^(https?:)?\/\//.test(p) || p.startsWith("data:")) return p;
    if (assetsDir && fs.existsSync(path.join(assetsDir, p))) return path.posix.join(jobRel, p);
    log(`WARN asset not found, dropping: ${p}`);
    return undefined;
  };
  if (sb.brand) sb.brand.logoPath = resolve(sb.brand.logoPath);
  for (const sc of sb.scenes ?? []) {
    sc.screenshotPaths = (sc.screenshotPaths ?? []).map(resolve).filter(Boolean);
    sc.bgVideoPath = resolve(sc.bgVideoPath);
  }
  if (sb.audio) {
    sb.audio.voPath = resolve(sb.audio.voPath);
    sb.audio.musicPath = resolve(sb.audio.musicPath);
  }
  return sb;
}

async function getServeUrl(): Promise<string> {
  const provided = args["serve-url"];
  if (typeof provided === "string" && fs.existsSync(provided)) {
    log(`reusing bundle ${provided}`);
    return provided;
  }
  if (args["reuse-bundle"] && fs.existsSync(BUNDLE_MARKER)) {
    const cached = fs.readFileSync(BUNDLE_MARKER, "utf8").trim();
    if (fs.existsSync(cached)) { log(`reusing cached bundle ${cached}`); return cached; }
  }
  const t0 = Date.now();
  log("bundling…");
  const serveUrl = await bundle({
    entryPoint: ENTRY,
    publicDir: PUBLIC_DIR,
    // Live-symlink public into the bundle so per-job assets staged AFTER bundling
    // are served without re-bundling (bundle-once for the 92-video batch).
    symlinkPublicDir: true,
    onProgress: (p) => { if (p % 25 === 0) log(`bundle ${p}%`); },
  });
  fs.mkdirSync(path.dirname(BUNDLE_MARKER), { recursive: true });
  fs.writeFileSync(BUNDLE_MARKER, serveUrl);
  log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${serveUrl}`);
  return serveUrl;
}

// pick a poster frame: prefer inside a CTA scene, else the Hook
function posterFrame(sb: any, fps: number): number {
  let acc = 0;
  const durs = sb.scenes.map((s: any) => Math.max(1, Math.round((s.durationSec ?? 5) * fps)));
  const cta = sb.scenes.findIndex((s: any) => s.type === "cta");
  if (cta >= 0) {
    for (let i = 0; i < cta; i++) acc += durs[i];
    return acc + Math.min(durs[cta] - 1, Math.round(fps * 1.4));
  }
  return Math.min(durs[0] - 1, Math.round(fps * 2));
}

async function main() {
  await ensureBrowser();
  const serveUrl = await getServeUrl();
  if (args["bundle-only"]) { console.log(JSON.stringify({ serveUrl })); return; }

  const storyboardPath = String(args.storyboard ?? "storyboards/launchreel.json");
  const assetsDir = args.assets ? path.resolve(String(args.assets)) : null;
  const raw = JSON.parse(fs.readFileSync(path.resolve(storyboardPath), "utf8"));
  const slug = String(args.slug ?? kebab(raw?.brand?.name ?? "job"));
  const outDir = path.resolve(String(args.out ?? path.join("out", slug)));
  fs.mkdirSync(outDir, { recursive: true });

  const inputProps = stageAssets(raw, assetsDir, slug);

  const t0 = Date.now();
  const composition = await selectComposition({ serveUrl, id: "Trailer", inputProps });
  log(`composition: ${composition.width}x${composition.height} ${composition.fps}fps ${composition.durationInFrames}f (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);

  const mp4 = path.join(outDir, "trailer.mp4");
  const poster = path.join(outDir, "poster.png");
  const concurrency = args.concurrency ? Number(args.concurrency) : null;

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: mp4,
    inputProps,
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: 18,
    muted: Boolean(args.muted),
    concurrency,
    chromiumOptions: { gl: "angle" },
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 20 === 0) log(`render ${pct}%`);
    },
  });

  const pf = args["poster-frame"] ? Number(args["poster-frame"]) : posterFrame(inputProps, composition.fps);
  await renderStill({
    serveUrl,
    composition,
    output: poster,
    frame: Math.min(pf, composition.durationInFrames - 1),
    inputProps,
    imageFormat: "png",
    chromiumOptions: { gl: "angle" },
  });

  const renderMs = Date.now() - t0;
  const bytes = fs.statSync(mp4).size;
  const summary = {
    ok: true,
    slug,
    mp4,
    poster,
    posterFrame: pf,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
    durationSec: +(composition.durationInFrames / composition.fps).toFixed(2),
    renderMs,
    renderSec: +(renderMs / 1000).toFixed(1),
    bytes,
    mb: +(bytes / 1e6).toFixed(2),
  };
  log(`DONE ${summary.renderSec}s, ${summary.mb} MB`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
