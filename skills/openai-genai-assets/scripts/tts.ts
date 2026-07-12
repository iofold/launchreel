#!/usr/bin/env bun
// Text-to-speech voiceover with OpenAI TTS. Default model gpt-4o-mini-tts:
// cheapest quality VO (~$0.015/min), steerable tone via --instructions.
// NOTE: gpt-4o-mini-tts has NO voice cloning and NO word timestamps. If you need
// scene-synced cuts, generate captions separately (e.g. Whisper on the rendered mp3).
//
// Usage:
//   bun run tts.ts --text "Your line." --out vo.mp3 [options]
//
// Options:
//   --text <string>       (required) OR --textfile <path> to read the script from a file
//   --out <path>          (required) output audio path
//   --model <id>          default gpt-4o-mini-tts  (also: tts-1, tts-1-hd)
//   --voice <name>        default onyx  (alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse ...)
//   --instructions <str>  tone/delivery steering (gpt-4o-mini-tts only; ignored by tts-1)
//   --format <fmt>        default mp3  (mp3 | opus | aac | flac | wav | pcm)
//
// The /audio/speech endpoint returns raw audio and NO usage object, so cost is
// estimated from script length (~$0.015/min). For exact duration, probe the file
// with ffprobe afterward.
//
// Env: OPENAI_API_KEY (required; never printed).
import { getKey, parseArgs, PRICING, usd, log, fail, API } from "./lib.ts";

const a = parseArgs(Bun.argv.slice(2));
let text = a.text as string;
if (a.textfile) text = await Bun.file(a.textfile as string).text();
const out = a.out as string;
if (a.help || !text || !out) {
  log("Usage: bun run tts.ts --text \"...\" --out vo.mp3 [--model gpt-4o-mini-tts] [--voice onyx] [--instructions \"confident narrator\"] [--format mp3]");
  process.exit(a.help ? 0 : 1);
}
const model = (a.model as string) ?? "gpt-4o-mini-tts";
const voice = (a.voice as string) ?? "onyx";
const format = (a.format as string) ?? "mp3";

const body: any = { model, voice, input: text, response_format: format };
if (a.instructions && model.includes("tts") && model.startsWith("gpt-4o")) body.instructions = a.instructions;

log(`[tts] model=${model} voice=${voice} format=${format} chars=${text.length} ...`);
const t0 = Date.now();
const res = await fetch(`${API}/audio/speech`, {
  method: "POST",
  headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const ms = Date.now() - t0;
if (!res.ok) {
  const errText = await res.text();
  fail(`HTTP ${res.status}: ${errText.slice(0, 500)}`);
}
const buf = Buffer.from(await res.arrayBuffer());
await Bun.write(out, buf);

// Rough cost estimate from script length (~750 chars/min narration).
const estMin = text.length / 750;
const p: any = (PRICING as any)[model] ?? PRICING["gpt-4o-mini-tts"];
const cost = p.perMinute ? estMin * p.perMinute : (text.length / 1e6) * p.perMChar;
log(`[tts] saved ${out} (${(buf.length / 1024).toFixed(0)} KB) in ${(ms / 1000).toFixed(1)}s`);
log(`[tts] est_duration≈${estMin.toFixed(2)}min est_cost≈${usd(cost)} (endpoint returns no usage; probe with ffprobe for exact)`);
console.log(JSON.stringify({ out, bytes: buf.length, ms, model, voice, format, chars: text.length, est_cost_usd: Number(cost.toFixed(5)) }));
