import type { BrandColors } from "./schema";

/**
 * Brand theme helpers. The renderer never invents brand identity — it takes the
 * required {bg, accent, ink} and fills a small "pop" palette. Missing accents are
 * derived as palette-SAFE tints/shades/mixes of the provided accents and ink/bg
 * (never hue-rotated into a new hue), so every scene background stays on-brand.
 * Brands that DO supply 4 accents still get the full multi-color LaunchReel look.
 */

// ---- tiny color math (hex <-> hsl) ----
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360 / 360;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgbToHex(r * 255, g * 255, b * 255);
}
export function rotate(hex: string, deg: number, satBoost = 0): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return hslToHex(h + deg, Math.max(0, Math.min(1, s + satBoost)), l);
}
export function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
}
/** readable text color (ink or paper) on a given fill */
export function readableOn(fill: string, ink: string, paper: string): string {
  return isDark(fill) ? paper : ink;
}
/** Linear RGB blend of two hex colors; amt=0 → a, amt=1 → b. Preserves brand hue
 * when b is a neutral (ink/paper/bg); yields an in-family blend between two accents. */
function mix(a: string, b: string, amt: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, amt));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}
/** Smallest separation between two hues, in degrees (0..180). */
function hueDist(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
/**
 * Guard: keep a color inside the brand palette. Near-neutral colors (low
 * saturation — tints/shades of ink or bg) always pass. A saturated color passes
 * only if its hue sits near a provided accent; otherwise it is an invented
 * off-brand hue and gets pulled back onto the nearest accent. Backstops the
 * palette-safe derivation below so scene backgrounds can never drift off-brand.
 */
function brandSafe(hex: string, accents: string[], ink: string): string {
  const [h, s] = rgbToHsl(...hexToRgb(hex));
  if (s < 0.22) return hex;
  const hues = accents.map((a) => rgbToHsl(...hexToRgb(a))[0]);
  let nearest = 0;
  for (let i = 1; i < hues.length; i++) {
    if (hueDist(h, hues[i]) < hueDist(h, hues[nearest])) nearest = i;
  }
  return hueDist(h, hues[nearest]) <= 40 ? hex : mix(hex, accents[nearest], 0.6);
}

export interface Theme {
  bg: string;
  paper: string;
  ink: string;
  accent: string;
  /** 5-color pop rotation used to color scenes, chips, stickers */
  pop: string[];
  shadow: string;
  border: string;
}

export function makeTheme(c: BrandColors): Theme {
  const paper = c.paper ?? "#FFFDF4";
  // The colors the customer actually gave us — the only hues allowed on screen.
  const provided = [c.accent, c.accent2, c.accent3, c.accent4].filter(Boolean) as string[];
  // A second color to build from: accent2 if supplied, else a deep shade of the
  // primary (mixed toward ink) — never an invented hue.
  const secondary = c.accent2 ?? mix(c.accent, c.ink, 0.45);
  // Fill any missing pop slots with palette-SAFE variants: tints/shades/mixes of
  // the provided accents and ink/paper. No hue rotation → no off-brand neon.
  const derived = [
    c.accent, // primary
    secondary, // secondary accent (or deep primary)
    mix(c.accent, paper, 0.32), // light tint of primary
    mix(secondary, c.ink, 0.3), // deep shade of secondary (used as a scene bg)
    mix(c.accent, secondary, 0.5), // primary↔secondary blend (used as a scene bg)
  ];
  const pop: string[] = [];
  for (let i = 0; i < 5; i++) pop.push(provided[i] ?? derived[i] ?? c.accent);
  // Guard: every pop color — some are full scene backgrounds — must stay on a
  // brand hue. Provided accents pass untouched; only stray hues get corrected.
  const accents = provided.length ? provided : [c.accent];
  const safePop = pop.map((col) => brandSafe(col, accents, c.ink));
  return {
    bg: c.bg,
    paper,
    ink: c.ink,
    accent: c.accent,
    pop: safePop,
    shadow: c.ink,
    border: `4px solid ${c.ink}`,
  };
}
