import { interpolate, Easing } from "remotion";
import { Camera } from "./Frame3D";
import { LayerDef } from "./layers";
import { PHASE, houseEase, inOut } from "./theme";

const clampI = (
  f: number,
  ir: [number, number],
  or: [number, number],
  easing = houseEase,
) => interpolate(f, ir, or, { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const PERSP = 1700;
const FREEZE = 46; // frame where the "playing ad" hard-freezes

// ---- camera path -------------------------------------------------------------
export function camera(f: number): Camera {
  // hook: open zoomed on the headline (reads as a normal type ad) with a slow
  //   push-in, then hard freeze; pull back + tilt to reveal it's one thin plane.
  // explode/crew: slow orbit, ease further back to hold the spread.
  // implode: slam back to a flat-on, filled "resumed" frame.
  const yaw = (() => {
    if (f < PHASE.pullEnd) return clampI(f, [PHASE.hookEnd, PHASE.pullEnd], [0, -20]);
    if (f < PHASE.implodeStart) return clampI(f, [PHASE.pullEnd, PHASE.implodeStart], [-20, -26], Easing.linear);
    return clampI(f, [PHASE.implodeStart, PHASE.implodeEnd], [-26, 0], inOut);
  })();

  const pitch = (() => {
    if (f < PHASE.pullEnd) return clampI(f, [PHASE.hookEnd, PHASE.pullEnd], [0, 13]);
    if (f < PHASE.implodeStart) {
      const base = clampI(f, [PHASE.pullEnd, PHASE.implodeStart], [13, 11], Easing.linear);
      return base + Math.sin((f - PHASE.pullEnd) / 42) * 1.2;
    }
    return clampI(f, [PHASE.implodeStart, PHASE.implodeEnd], [11, 0], inOut);
  })();

  const dolly = (() => {
    if (f < FREEZE) return clampI(f, [0, FREEZE], [700, 748], Easing.linear); // slow push-in on headline
    if (f < PHASE.hookEnd) return 748; // freeze hold
    if (f < PHASE.pullEnd) return clampI(f, [PHASE.hookEnd, PHASE.pullEnd], [748, -250]);
    if (f < PHASE.implodeStart) return clampI(f, [PHASE.pullEnd, PHASE.implodeStart], [-250, -430], Easing.linear);
    return clampI(f, [PHASE.implodeStart, PHASE.implodeEnd], [-430, 250], inOut);
  })();

  const shiftX = (() => {
    if (f < PHASE.pullEnd) return clampI(f, [PHASE.hookEnd, PHASE.pullEnd], [0, 30]);
    if (f < PHASE.implodeStart) return clampI(f, [PHASE.pullEnd, PHASE.implodeStart], [30, 44], Easing.linear);
    return clampI(f, [PHASE.implodeStart, PHASE.implodeEnd], [44, 0], inOut);
  })();

  return { yaw, pitch, dolly, persp: PERSP, originY: 50, shiftX, shiftY: 0 };
}

// ---- per-layer explosion 0..1 -----------------------------------------------
// staggered outward cascade during explode; hold; fast slam on implosion.
export function layerAmt(f: number, i: number, n: number): number {
  const start = PHASE.pullEnd + i * 7; // stagger
  const end = Math.min(start + 150, PHASE.explodeEnd);
  if (f <= PHASE.pullEnd) return 0;
  if (f < PHASE.implodeStart) return clampI(f, [start, end], [0, 1]);
  // implosion: accelerate home (easeIn), slight reverse-stagger so front lands last
  const io = clampI(
    f,
    [PHASE.implodeStart + (n - 1 - i) * 2, PHASE.implodeEnd],
    [1, 0],
    Easing.bezier(0.5, 0, 0.75, 0.2),
  );
  return io;
}

// hidden (non-hero) layers fade their detail in as they separate
export function reveal(f: number, i: number, hero: boolean): number {
  if (hero) return 1;
  const a = layerAmt(f, i, 12);
  return interpolate(a, [0.04, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

// callout chips: appear after the layer has traveled a bit, fade before implosion
export function chipOpacity(f: number, i: number): number {
  const a = layerAmt(f, i, 12);
  const born = interpolate(a, [0.45, 0.72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // fade chips out as the implosion starts
  const die = clampI(f, [PHASE.implodeStart - 8, PHASE.implodeStart + 22], [1, 0], inOut);
  return born * die;
}

// ---- crew assembly (375..510) -----------------------------------------------
export const CREW_WIN: [number, number] = [388, 500];
export function activeCrew(f: number): number {
  const [a, b] = CREW_WIN;
  if (f < a || f > b) return -1;
  return Math.min(4, Math.floor(((f - a) / (b - a)) * 5));
}
// 0..1 pulse while a crew is being assembled (peaks mid-window)
export function crewPulse(f: number, crew: number): number {
  const [a, b] = CREW_WIN;
  const span = (b - a) / 5;
  const start = a + crew * span;
  return interpolate(f, [start, start + span * 0.5, start + span], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ---- VO-b word sync: "Type. Timing. Color. Cut." (starts frame 232) ---------
export const WORDS: { label: string; layer: string; at: number }[] = [
  { label: "TYPE", layer: "headline", at: 236 },
  { label: "TIMING", layer: "beats", at: 260 },
  { label: "COLOR", layer: "palette", at: 284 },
  { label: "CUT", layer: "scene", at: 306 },
];
export function wordPulse(f: number, layerId: string): number {
  const w = WORDS.find((x) => x.layer === layerId);
  if (!w) return 0;
  return interpolate(f, [w.at, w.at + 6, w.at + 24], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

// ---- watermark peel (after the slam) ----------------------------------------
export function peelAmt(f: number): number {
  return clampI(f, [PHASE.implodeEnd + 4, PHASE.implodeEnd + 42], [0, 1], inOut);
}

// implosion motion-blur envelope (px)
export function implodeBlur(f: number): number {
  if (f < PHASE.implodeStart || f > PHASE.implodeEnd + 6) return 0;
  // peak blur mid-slam, resolves to 0 at impact
  const speed = interpolate(
    f,
    [PHASE.implodeStart, (PHASE.implodeStart + PHASE.implodeEnd) / 2, PHASE.implodeEnd, PHASE.implodeEnd + 6],
    [0, 9, 2, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return speed;
}
