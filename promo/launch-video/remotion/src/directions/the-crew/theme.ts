// THE CREW — local theme: fonts, timing map, paper texture, small helpers.
// Direction-local only. Brand tokens come from ../../lib/brand.
import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadDMMono } from "@remotion/google-fonts/DMMono";
import { COLORS } from "../../lib/brand";

export const FONT_DISPLAY = loadArchivoBlack().fontFamily; // huge crew names
export const FONT_SANS = loadArchivo().fontFamily; // roles / body
export const FONT_MONO = loadDMMono().fontFamily; // dossier / stamps / index

// Manila-folder tan (hook prop only — not a brand surface).
export const MANILA = "#E9CE9A";
export const MANILA_EDGE = "#D8B77B";
export const STAMP_RED = "#C4362E"; // rubber-stamp ink (deadline / red stamps)

// The five crew members, each with a deadpan credential one-liner.
export const CREW_LINES = [
  { credential: "cases your website in ninety seconds", tag: "RECON" },
  { credential: "found your value prop. it was in the footer.", tag: "INTEL" },
  { credential: "six scenes. no notes.", tag: "BOARDS" },
  { credential: "does the work of 47 After Effects layers", tag: "MOTION" },
  { credential: "invites everyone. even your investors.", tag: "DROP" },
] as const;

// ---- Master timeline (frames @ 30fps, 900 total) ----
export const T = {
  hook: { start: 0, end: 96 },
  cards: { start: 96, per: 69 }, // 5 cards -> 96..441
  montage: { start: 441, end: 660 },
  delivery: { start: 660, end: 786 },
  end: { start: 786, end: 900 },
} as const;

// VO cue frames (each name lands a beat after its card slams in).
export const VO = {
  intro: 15,
  scout: 108,
  strategist: 177,
  director: 246,
  renderer: 315,
  publisher: 384,
  outro: 462,
  tag: 700,
} as const;

// Subtle paper grain as an inline SVG data-URI (feTurbulence). Tiled, very low alpha.
export const paperNoiseUri = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.05'/></svg>`,
)}")`;

export const INK = COLORS.ink;
