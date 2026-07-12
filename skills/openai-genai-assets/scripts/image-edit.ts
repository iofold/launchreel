#!/usr/bin/env bun
// Instruction-edit one or more source images with gpt-image-2.
// This is gpt-image's differentiator: it re-renders the reference at high fidelity
// and follows natural-language edit instructions (recolor, restyle, add/remove, compose).
//
// Usage:
//   bun run image-edit.ts --image in.png --prompt "recolor to gold and black" --out edited.png [options]
//   bun run image-edit.ts --image a.png --image b.png --prompt "combine into one poster" --out out.png
//
// Options:
//   --image <path>      (required, repeatable) source image(s); first repeat is the base
//   --prompt <text>     (required) edit instruction
//   --out <path>        (required) output .png path
//   --model <id>        default gpt-image-2
//   --size <WxH>        default 1024x1536
//   --quality <level>   default low (low | medium | high | auto)
//   --mask <path>       optional PNG mask (transparent = area to edit)
//
// COST NOTE: edits always bill input IMAGE tokens for every source read at high fidelity
// (~1536 tokens per 1024x1536 source), so an edit costs noticeably more than a fresh gen.
//
// Env: OPENAI_API_KEY (required; never printed).
import { getKey, parseArgs, postForm, saveB64Image, imageCost, usd, log } from "./lib.ts";

// collect repeated --image flags manually (parseArgs keeps only the last)
const argv = Bun.argv.slice(2);
const images: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--image" && argv[i + 1]) { images.push(argv[i + 1]); i++; }
  else if (argv[i].startsWith("--image=")) images.push(argv[i].slice(8));
}
const a = parseArgs(argv);
const prompt = a.prompt as string;
const out = a.out as string;
if (a.help || !images.length || !prompt || !out) {
  log("Usage: bun run image-edit.ts --image in.png [--image in2.png] --prompt \"...\" --out file.png [--model gpt-image-2] [--size 1024x1536] [--quality low] [--mask mask.png]");
  process.exit(a.help ? 0 : 1);
}
const model = (a.model as string) ?? "gpt-image-2";
const size = (a.size as string) ?? "1024x1536";
const quality = (a.quality as string) ?? "low";

const mime = (p: string) =>
  /\.jpe?g$/i.test(p) ? "image/jpeg" : /\.webp$/i.test(p) ? "image/webp" : "image/png";

const form = new FormData();
form.append("model", model);
form.append("prompt", prompt);
form.append("size", size);
form.append("quality", quality);
for (const p of images)
  form.append("image[]", new Blob([await Bun.file(p).arrayBuffer()], { type: mime(p) }), p.split("/").pop());
if (a.mask)
  form.append("mask", new Blob([await Bun.file(a.mask as string).arrayBuffer()], { type: "image/png" }), "mask.png");

log(`[image-edit] model=${model} sources=${images.length} size=${size} quality=${quality} ...`);
const { json, ms } = await postForm("/images/edits", getKey(), form);
const bytes = await saveB64Image(json, out);
const cost = imageCost(model, json.usage);
log(`[image-edit] saved ${out} (${(bytes / 1024).toFixed(0)} KB) in ${(ms / 1000).toFixed(1)}s`);
log(`[image-edit] usage=${JSON.stringify(json.usage)} est_cost=${usd(cost)}`);
console.log(JSON.stringify({ out, bytes, ms, model, size, quality, sources: images.length, usage: json.usage, est_cost_usd: Number(cost.toFixed(5)) }));
