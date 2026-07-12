// EXPLODED UI — local theme + helpers. CSS-3D exploded-diagram of a trailer frame.
import { interpolate } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/SpaceMono";
import { COLORS, EASE } from "../../lib/brand";

export const DISPLAY = loadDisplay().fontFamily; // Archivo Black — headlines / stamps
export const GROTESK = loadGrotesk().fontFamily; // Space Grotesk — UI chrome
export const MONO = loadMono().fontFamily; // Space Mono — technical callout chips

export { COLORS };

// House easing as a cubic-bezier for CSS + an easing fn for interpolate().
import { Easing } from "remotion";
export const houseEase = Easing.bezier(EASE[0], EASE[1], EASE[2], EASE[3]);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const backOut = Easing.bezier(0.34, 1.3, 0.5, 1);

// Trailer-frame geometry (a vertical 9:16 "finished trailer frame").
export const FW = 486;
export const FH = 864;

// Master phase boundaries (frames @30fps, 900 total).
export const PHASE = {
  hookEnd: 54, // 1.8s — flat ad plays, then freeze
  pullEnd: 120, // 4.0s — camera pulled back, slab revealed + "47 parts" stamp
  explodeEnd: 375, // 12.5s — full teardown reached
  crewEnd: 510, // 17.0s — crew assembly done
  implodeStart: 510, // 17.0s — slam begins (on the musical onset)
  implodeEnd: 615, // 20.5s — everything home (peak energy hit)
  endcardStart: 660, // 22.0s — brand end card takes over
} as const;

export const smooth = (
  frame: number,
  inRange: [number, number],
  outRange: [number, number],
  easing = houseEase,
) =>
  interpolate(frame, inRange, outRange, {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
