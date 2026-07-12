// Fonts for the speedrun-receipt direction.
// UI  = clean system-UI stand-in (Inter) — faithful to the shipped app's system font stack.
// MONO = digital speedrun timer (JetBrains Mono, tabular).
// DOT  = dot-matrix receipt (VT323) with Inter fallback so the ₹ rupee glyph always renders.
// Weights/subsets are pinned so the render makes a handful of font requests, not hundreds.
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadVT } from "@remotion/google-fonts/VT323";

const subsets = ["latin", "latin-ext"];

const inter = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets,
  ignoreTooManyRequestsWarning: true,
});
const mono = loadMono("normal", {
  weights: ["700", "800"],
  subsets,
  ignoreTooManyRequestsWarning: true,
});
const vt = loadVT("normal", { weights: ["400"], subsets, ignoreTooManyRequestsWarning: true });

export const UI = inter.fontFamily;
export const MONO = mono.fontFamily;
// VT323 lacks the ₹ glyph — fall back to Inter for it, then generic monospace.
export const DOT = `${vt.fontFamily}, ${inter.fontFamily}, monospace`;
// Money stack: mono digits but Inter for ₹.
export const MONEY = `${mono.fontFamily}, ${inter.fontFamily}, monospace`;
