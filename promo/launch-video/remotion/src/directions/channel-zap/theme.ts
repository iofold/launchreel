// CHANNEL ZAP — fonts + timing map + small helpers shared across scenes.
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadArchivo } from "@remotion/google-fonts/ArchivoBlack";

// Big broadcast display face, plus a heavy UI face and a legible UI body.
export const ANTON = `${loadAnton().fontFamily}, 'Arial Narrow', sans-serif`;
export const ARCHIVO = `${loadArchivo().fontFamily}, system-ui, sans-serif`;
export const INTER = `${loadInter().fontFamily}, system-ui, sans-serif`;

// Absolute frame map for the 30s / 900f cut. [startInclusive, endExclusive).
export const T = {
  hook: [0, 96] as const,
  ch01: [96, 262] as const, // the sad launch
  ch02: [262, 360] as const, // paste a url
  ch03: [360, 450] as const, // the crew
  ch04: [450, 528] as const, // finished trailer in a TV
  guide: [528, 702] as const, // program guide
  signoff: [702, 900] as const, // end-card
};

// Frames where a hard channel-zap happens (centre of the static burst).
export const ZAPS = [96, 262, 360, 450, 528] as const;

export const dur = (span: readonly [number, number]) => span[1] - span[0];
