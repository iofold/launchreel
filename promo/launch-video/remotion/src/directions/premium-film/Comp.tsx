import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { Beam } from "./scenes/Beam";
import { Coalesce } from "./scenes/Coalesce";
import { Reel } from "./scenes/Reel";
import { Marquee } from "./scenes/Marquee";
import { EndCard } from "./scenes/EndCard";

// OPENING NIGHT — the cinematic direction. Three brand-locked Veo keyframe-pair
// beds under elegant Remotion type, one deterministic filmstrip of real product
// frames, and a pop-brand end-card. 900 frames @ 30fps = 30.0s.
const SCENES = [
  { C: Beam, from: 0, dur: 180 },
  { C: Coalesce, from: 180, dur: 180 },
  { C: Reel, from: 360, dur: 180 },
  { C: Marquee, from: 540, dur: 180 },
  { C: EndCard, from: 720, dur: 180 },
] as const;

// VO segments (paced, one phrase per beat) — [file, startFrame]
const VO: [string, number][] = [
  ["vo1.mp3", 26], // "You didn't build this in a weekend."  (beam)
  ["vo2.mp3", 108], // "Don't launch it in a sentence."       (beam)
  ["vo3.mp3", 206], // "Five agents. Thirty seconds."         (coalesce)
  ["vo4.mp3", 582], // "One opening night."                   (marquee)
  ["vo5.mp3", 742], // "LaunchReel."                          (end-card)
];

// windows to duck the music under (roughly each VO span, generously padded)
const DUCK_WINDOWS: [number, number][] = [
  [24, 200],
  [206, 320],
  [582, 660],
  [742, 808],
];

const musicVolume = (f: number) => {
  const base = 0.5;
  let inside = 0;
  for (const [a, b] of DUCK_WINDOWS) {
    inside = Math.max(
      inside,
      interpolate(f, [a - 10, a, b, b + 10], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
  }
  const fadeIn = interpolate(f, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [852, 899], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return base * (1 - 0.46 * inside) * fadeIn * fadeOut;
};

export const OpeningNight: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SCENES.map(({ C, from, dur }, i) => (
        <Sequence key={i} from={from} durationInFrames={dur}>
          <C duration={dur} />
        </Sequence>
      ))}

      {/* music bed — ducked under VO, gentle fade in/out */}
      <Audio src={staticFile("gen/premium-film/music.mp3")} volume={musicVolume} />

      {/* paced voiceover */}
      {VO.map(([file, from]) => (
        <Sequence key={file} from={from}>
          <Audio src={staticFile(`gen/premium-film/${file}`)} volume={0.95} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
