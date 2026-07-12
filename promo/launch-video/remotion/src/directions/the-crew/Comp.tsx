import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../../lib/brand";
import { T, VO } from "./theme";
import { Hook } from "./Hook";
import { CrewCards } from "./CrewCards";
import { Montage } from "./Montage";
import { Delivery } from "./Delivery";
import { EndCard } from "./EndCard";

const g = (p: string) => staticFile(`gen/the-crew/${p}`);

// VO cue -> clip length in frames (@30fps), for music ducking windows.
const VO_WINS: [number, number][] = [
  [VO.intro, 90],
  [VO.scout, 64],
  [VO.strategist, 47],
  [VO.director, 56],
  [VO.renderer, 43],
  [VO.publisher, 66],
  [VO.outro, 155],
  [VO.tag, 98],
];

const musicVol = (f: number) => {
  const base = 0.5;
  const low = 0.22;
  const ramp = 10;
  let v = base;
  for (const [s, d] of VO_WINS) {
    const a = interpolate(f, [s - ramp, s, s + d, s + d + ramp], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    v = Math.min(v, interpolate(a, [0, 1], [base, low]));
  }
  // fade in / out
  v *= interpolate(f, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  v *= interpolate(f, [880, 900], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return v;
};

const VoClip: React.FC<{ from: number; src: string; vol?: number }> = ({ from, src, vol = 1 }) => (
  <Sequence from={from} name={`vo-${src}`}>
    <Audio src={g(src)} volume={vol} />
  </Sequence>
);

export const TheCrew: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.cream }}>
      {frame < T.cards.start && <Hook />}
      {frame >= T.cards.start && frame < T.montage.start && <CrewCards />}
      {frame >= T.montage.start && frame < T.delivery.start && <Montage />}
      {frame >= T.delivery.start && frame < T.end.start && <Delivery />}
      {frame >= T.end.start && <EndCard />}

      {/* music bed with VO ducking */}
      <Audio src={g("music.mp3")} volume={musicVol} />

      {/* voiceover — deadpan echo narrator, one clip per beat */}
      <VoClip from={VO.intro} src="vo-intro.mp3" />
      <VoClip from={VO.scout} src="vo-scout.mp3" />
      <VoClip from={VO.strategist} src="vo-strategist.mp3" />
      <VoClip from={VO.director} src="vo-director.mp3" />
      <VoClip from={VO.renderer} src="vo-renderer.mp3" />
      <VoClip from={VO.publisher} src="vo-publisher.mp3" />
      <VoClip from={VO.outro} src="vo-outro.mp3" />
      <VoClip from={VO.tag} src="vo-tag.mp3" />
    </AbsoluteFill>
  );
};
