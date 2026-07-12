// The spine: a speedrun clock top-right that runs the whole 30s and lands on 00:47.21.
import { interpolate } from "remotion";

// Master timeline (global frames @30fps, 900 total).
export const TL = {
  hook: { from: 0, dur: 60 }, // 0–2s  title card, timer starts
  intake: { from: 60, dur: 190 }, // 2–8.3s  cursor fills the intake form
  crew: { from: 250, dur: 350 }, // 8.3–20s  the crew works (×8 fast-forward)
  delivery: { from: 600, dur: 120 }, // 20–24s  reel ready, PB stamp + confetti
  receipt: { from: 720, dur: 180 }, // 24–30s  dot-matrix receipt + end-card
} as const;

// Timer model. Real-time 1× through hook+intake, then a fast-forward that lands
// exactly on the personal best at the delivery moment, then frozen.
const A_END = TL.crew.from; // 250 — end of real-time phase
const FREEZE = TL.delivery.from; // 600 — timer freezes here
export const PB_CENTIS = 4721; // 00:47.21

export function speedrunCentis(frame: number): number {
  if (frame <= A_END) return (frame / 30) * 100; // real seconds → centiseconds
  if (frame >= FREEZE) return PB_CENTIS;
  const startC = (A_END / 30) * 100; // 833.33
  // Fast-forward engages the instant the ×8 chip appears and races linearly so the digits
  // keep ripping the whole montage, then hard-freezes on the PB at delivery.
  const eased = interpolate(frame, [A_END, FREEZE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return startC + (PB_CENTIS - startC) * eased;
}

const p2 = (x: number) => Math.floor(x).toString().padStart(2, "0");

export function fmtTimer(centis: number): string {
  const total = Math.max(0, Math.round(centis));
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cc = total % 100;
  return `${p2(m)}:${p2(s)}.${p2(cc)}`;
}
