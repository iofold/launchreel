# LaunchReel render — deterministic Remotion trailer renderer

`storyboard.json` in → `out/<slug>/trailer.mp4` + `out/<slug>/poster.png`. One
composition (`Trailer`, 1080×1920 @ 30fps), six scenes driven entirely by props.
No LLM-authored render code — the storyboard is the only variable input.

## Run

```bash
# render a trailer (bundles on first call)
scripts/render.sh --storyboard storyboards/launchreel.json \
                  --assets    assets/launchreel \
                  --out       out/launchreel --slug launchreel

# batch path: bundle once, reuse for many renders (skips the ~1–5s webpack step)
SU=$(node --import tsx scripts/render.ts --bundle-only | jq -r .serveUrl)
scripts/render.sh --storyboard sb1.json --assets a1 --out out/j1 --slug j1 --serve-url "$SU"
scripts/render.sh --storyboard sb2.json --assets a2 --out out/j2 --slug j2 --serve-url "$SU"
```

Emits a JSON summary on stdout (`{ok, mp4, poster, durationSec, renderSec, mb, ...}`)
and progress on stderr. Non-interactive — safe to call from `agent/worker.py`.

Flags: `--storyboard <json>` `--assets <dir>` `--out <dir>` `--slug <s>`
`--serve-url <bundleDir>` `--reuse-bundle` `--poster-frame <n>` `--concurrency <n>`
`--muted` `--bundle-only`.

## Contract

- **Asset paths** in the storyboard (`brand.logoPath`, `scenes[].screenshotPaths[]`,
  `scenes[].bgVideoPath`, `audio.voPath/musicPath`) are **relative to `--assets`**.
  The script copies that dir into `public/jobs/<slug>/` (served live via a symlinked
  public dir) and rewrites the paths. Missing optional assets degrade to solid
  brand-color fields.
- **Schema**: `storyboard.schema.json` (JSON Schema) + `src/schema.ts` (zod, source of
  truth). This is what the storyboard-writer LLM must emit.
- **Fonts** are vendored in `public/fonts/` (Archivo Black + Archivo) — no network at
  render time.

## Studio (visual editing)

```bash
npx remotion studio src/index.ts   # add --no-sandbox is automatic in containers
```

## Notes

- Requires Remotion's Chrome shell (`npx remotion browser ensure`, auto on first run).
  Chrome runs `--no-sandbox` by default — works in containers.
- Measured on an 8-core box: ~40s render + ~1–5s bundle per 30s trailer (see task report).
