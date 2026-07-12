#!/usr/bin/env bun
// Generate an image with OpenAI's gpt-image models.
//
// Usage:
//   bun run image-gen.ts --prompt "..." --out poster.png [options]
//
// Options:
//   --prompt <text>     (required) what to draw
//   --out <path>        (required) output .png path
//   --model <id>        default gpt-image-2  (also: gpt-image-1.5, gpt-image-1, gpt-image-1-mini)
//   --size <WxH>        default 1024x1536    (1024x1024 | 1024x1536 portrait | 1536x1024 landscape | auto)
//   --quality <level>   default low          (low | medium | high | auto) -- dominates cost
//   --background <mode> opaque | transparent (transparent needs png/webp output)
//   --n <count>         default 1
//
// Env: OPENAI_API_KEY (required; never printed).
import { getKey, parseArgs, postJSON, saveB64Image, imageCost, usd, log, fail } from "./lib.ts";

const a = parseArgs(Bun.argv.slice(2));
const prompt = a.prompt as string;
const out = a.out as string;
if (a.help || !prompt || !out) {
  log("Usage: bun run image-gen.ts --prompt \"...\" --out file.png [--model gpt-image-2] [--size 1024x1536] [--quality low] [--background opaque] [--n 1]");
  process.exit(a.help ? 0 : 1);
}
const model = (a.model as string) ?? "gpt-image-2";
const size = (a.size as string) ?? "1024x1536";
const quality = (a.quality as string) ?? "low";

const body: any = { model, prompt, size, quality, n: Number(a.n ?? 1) };
if (a.background) body.background = a.background;

log(`[image-gen] model=${model} size=${size} quality=${quality} ...`);
const { json, ms } = await postJSON("/images/generations", getKey(), body);
const bytes = await saveB64Image(json, out);
const cost = imageCost(model, json.usage);
log(`[image-gen] saved ${out} (${(bytes / 1024).toFixed(0)} KB) in ${(ms / 1000).toFixed(1)}s`);
log(`[image-gen] usage=${JSON.stringify(json.usage)} est_cost=${usd(cost)}`);
// stdout = machine-readable one-liner for pipelines
console.log(JSON.stringify({ out, bytes, ms, model, size, quality, usage: json.usage, est_cost_usd: Number(cost.toFixed(5)) }));
