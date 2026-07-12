// Single source of truth for the intake beat: layout coords, typing schedule, cursor
// path and click/SFX frames — all in LOCAL frames (Intake sequence starts at global 60).
// Both the renderer (Intake.tsx), the cursor, and the SFX bus import from here so they
// never drift.

export const INTAKE_FROM = 60; // global frame where the intake sequence begins

// ---- layout (1920×1080 space) ----------------------------------------------
// Right column starts below y≈200 so the top-right timer HUD never overlaps the form.
export const COL_R = 900; // right form column x
export const COL_W = 900;
export const F = {
  product: 210,
  oneliner: 320,
  email: 430,
  website: 540,
};
export const FIELD_H = 60;
export const TIER = { free: 662, launch: 736, pack: 818, h: 64 };
export const BTN = { y: 902, h: 72 };

const cx = COL_R + COL_W / 2;
export const T_PRODUCT = { x: cx, y: F.product + FIELD_H / 2 };
export const T_WEBSITE = { x: cx, y: F.website + FIELD_H / 2 };
export const T_TIER = { x: cx, y: TIER.launch + TIER.h / 2 };
export const T_BUTTON = { x: cx, y: BTN.y + BTN.h / 2 };

// ---- typing schedule --------------------------------------------------------
export function typeSchedule(start: number, text: string, interval: number, seed = 1): number[] {
  const out: number[] = [];
  let acc = start;
  for (let i = 0; i < text.length; i++) {
    const h = Math.sin((i + 1) * seed * 12.9898) * 43758.5453;
    const jit = (h - Math.floor(h)) * 2.4 - 0.8; // ~ -0.8..1.6 frame jitter
    acc += interval;
    out.push(Math.round(acc + jit));
  }
  return out;
}

export const PRODUCT_TEXT = "Ledgerly";
export const WEBSITE_TEXT = "ledgerly.app";
export const PRODUCT_FRAMES = typeSchedule(30, PRODUCT_TEXT, 3.6, 3.1);
export const WEBSITE_FRAMES = typeSchedule(76, WEBSITE_TEXT, 2.7, 7.7);

// ---- key events (local frames) ---------------------------------------------
export const CLICK_PRODUCT = 26;
export const CLICK_WEBSITE = 72;
export const CLICK_TIER = 122;
export const SLAM_BUTTON = 142;
export const INTAKE_END = 190;

// ---- cursor path (local frames) --------------------------------------------
export const CURSOR_PATH = [
  { f: 6, x: 1560, y: 1080 },
  { f: 24, ...T_PRODUCT },
  { f: 66, ...T_PRODUCT }, // hold while typing product
  { f: 72, ...T_WEBSITE },
  { f: 116, ...T_WEBSITE }, // hold while typing website
  { f: 122, ...T_TIER },
  { f: 134, ...T_TIER },
  { f: 142, ...T_BUTTON },
  { f: 190, ...T_BUTTON },
];

export const CURSOR_CLICKS = [
  { f: CLICK_PRODUCT, ...T_PRODUCT, soft: true },
  { f: CLICK_WEBSITE, ...T_WEBSITE, soft: true },
  { f: CLICK_TIER, ...T_TIER, soft: true },
  { f: SLAM_BUTTON, ...T_BUTTON, soft: false },
];
