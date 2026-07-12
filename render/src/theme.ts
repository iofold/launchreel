import type { BrandColors } from "./schema";

/**
 * Brand theme helpers. The renderer never invents brand identity — it takes the
 * required {bg, accent, ink} and fills a small "pop" palette, deriving any missing
 * accents from the primary by hue rotation so every trailer stays on-brand while
 * still getting the multi-color neo-brutalist LaunchReel look.
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
  // Build the pop palette: use provided extras first, then derive by hue rotation.
  const provided = [c.accent, c.accent2, c.accent3, c.accent4].filter(Boolean) as string[];
  const derived = [
    c.accent,
    rotate(c.accent, 150, 0.05),
    rotate(c.accent, 45, 0.1),
    rotate(c.accent, 210, 0),
    rotate(c.accent, 300, 0.05),
  ];
  const pop: string[] = [];
  for (let i = 0; i < 5; i++) pop.push(provided[i] ?? derived[i] ?? c.accent);
  return {
    bg: c.bg,
    paper,
    ink: c.ink,
    accent: c.accent,
    pop,
    shadow: c.ink,
    border: `4px solid ${c.ink}`,
  };
}
