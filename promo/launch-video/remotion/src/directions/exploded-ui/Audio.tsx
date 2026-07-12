import React from "react";
import { Audio, Sequence, staticFile, interpolate } from "remotion";
import { PHASE } from "./theme";

// VO segments (frame starts). Durations: a 3.65 · b 3.0 · c 3.5 · d 3.82 · e 1.42s.
const VO = [
  { src: "gen/exploded-ui/vo-a.mp3", at: 66, dur: 116 }, // "…forty-seven decisions."
  { src: "gen/exploded-ui/vo-b.mp3", at: 232, dur: 96 }, // "Type. Timing. Color. Cut."
  { src: "gen/exploded-ui/vo-c.mp3", at: 392, dur: 112 }, // "Our crew makes all of them. In minutes."
  { src: "gen/exploded-ui/vo-d.mp3", at: 636, dur: 120 }, // "You paste a URL. That's your one moving part."
  { src: "gen/exploded-ui/vo-e.mp3", at: 802, dur: 48 }, // "LaunchReel."
];

// ducking windows (with small pre/post pad)
const DUCK: [number, number][] = VO.map((v) => [v.at - 6, v.at + v.dur + 6]);

function musicVol(fr: number): number {
  const base = 0.8;
  // implosion swell
  const swell = interpolate(
    fr,
    [PHASE.implodeStart + 74, PHASE.implodeEnd, PHASE.implodeEnd + 20],
    [0, 0.22, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  let v = base + swell;
  for (const [a, b] of DUCK) {
    if (fr >= a && fr <= b) {
      const g = Math.min(
        interpolate(fr, [a, a + 8], [1, 0.34], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        interpolate(fr, [b - 8, b], [0.34, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      );
      v = Math.min(v, base * g + swell);
    }
  }
  // gentle intro rise + long tail fade
  v *= interpolate(fr, [0, 18], [0.2, 1], { extrapolateRight: "clamp" });
  v *= interpolate(fr, [846, 900], [1, 0], { extrapolateLeft: "clamp" });
  return Math.max(0, v);
}

export const Mix: React.FC = () => {
  return (
    <>
      <Audio src={staticFile("gen/exploded-ui/music.mp3")} volume={(fr) => musicVol(fr)} />

      {/* soft ticking reprise under the end card (reuse the intro bars) */}
      <Sequence from={760} durationInFrames={140}>
        <Audio
          src={staticFile("gen/exploded-ui/music.mp3")}
          trimBefore={8}
          trimAfter={150}
          volume={(fr) => interpolate(fr, [0, 20, 110, 138], [0, 0.16, 0.16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      </Sequence>

      {VO.map((v) => (
        <Sequence key={v.src} from={v.at}>
          <Audio src={staticFile(v.src)} volume={1} />
        </Sequence>
      ))}
    </>
  );
};
