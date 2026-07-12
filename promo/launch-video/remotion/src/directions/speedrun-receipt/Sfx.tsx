// Audio bus: Lyria music bed + warm end pad + all synthesized one-shot SFX, scheduled on
// global frames. SFX-led per the brief; music sits under everything.
import React from "react";
import { Audio, Sequence, staticFile, interpolate } from "remotion";
import { TL } from "./timer";
import { INTAKE_FROM, PRODUCT_FRAMES, WEBSITE_FRAMES, CLICK_PRODUCT, CLICK_WEBSITE, CLICK_TIER, SLAM_BUTTON, INTAKE_END } from "./intakeShared";
import { CREW_FROM, AGENTS, SCENES } from "./crewShared";
import { TEAR_GLOBAL } from "./receiptTiming";

const g = (name: string) => staticFile(`gen/speedrun-receipt/${name}`);

const OneShot: React.FC<{ src: string; at: number; volume?: number; dur?: number }> = ({ src, at, volume = 1, dur = 60 }) => (
  <Sequence from={Math.round(at)} durationInFrames={dur} layout="none">
    <Audio src={src} volume={volume} />
  </Sequence>
);

export const Sfx: React.FC = () => {
  // typing clacks
  const clacks: React.ReactNode[] = [];
  PRODUCT_FRAMES.forEach((lf, i) =>
    clacks.push(<OneShot key={`p${i}`} src={g(`key${(i % 4) + 1}.wav`)} at={INTAKE_FROM + lf} volume={0.34} dur={6} />),
  );
  WEBSITE_FRAMES.forEach((lf, i) =>
    clacks.push(<OneShot key={`w${i}`} src={g(`key${((i + 2) % 4) + 1}.wav`)} at={INTAKE_FROM + lf} volume={0.34} dur={6} />),
  );

  // crew status ticks
  const ticks: React.ReactNode[] = [];
  AGENTS.forEach((a, i) => {
    ticks.push(<OneShot key={`aw${i}`} src={g("tick.wav")} at={CREW_FROM + a.work} volume={0.3} dur={6} />);
    ticks.push(<OneShot key={`ad${i}`} src={g("tickhi.wav")} at={CREW_FROM + a.done} volume={0.34} dur={6} />);
  });
  SCENES.forEach((s, i) => ticks.push(<OneShot key={`sc${i}`} src={g("tick.wav")} at={CREW_FROM + s.done} volume={0.24} dur={6} />));

  return (
    <>
      {/* music bed with volume automation */}
      <Audio
        src={g("music.mp3")}
        volume={(f) =>
          interpolate(
            f,
            [0, 55, TL.crew.from, TL.delivery.from - 20, TL.delivery.from, TL.receipt.from, 810],
            [0.0, 0.46, 0.6, 0.82, 0.8, 0.6, 0.5],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      {/* warm end-card pad */}
      <Sequence from={700} durationInFrames={200} layout="none">
        <Audio src={g("endpad.wav")} volume={(f) => interpolate(f, [0, 20, 160, 200], [0, 0.34, 0.34, 0], { extrapolateRight: "clamp" })} />
      </Sequence>

      {/* starting gun */}
      <OneShot src={g("start.wav")} at={1} volume={0.85} dur={10} />

      {clacks}

      {/* cursor clicks */}
      <OneShot src={g("click.wav")} at={INTAKE_FROM + CLICK_PRODUCT} volume={0.55} dur={6} />
      <OneShot src={g("click.wav")} at={INTAKE_FROM + CLICK_WEBSITE} volume={0.55} dur={6} />
      <OneShot src={g("click.wav")} at={INTAKE_FROM + CLICK_TIER} volume={0.6} dur={6} />
      <OneShot src={g("slam.wav")} at={INTAKE_FROM + SLAM_BUTTON} volume={0.85} dur={20} />
      <OneShot src={g("whoosh.wav")} at={INTAKE_FROM + INTAKE_END - 12} volume={0.4} dur={20} />

      {ticks}

      {/* delivery ding + pop */}
      <OneShot src={g("ding.wav")} at={TL.delivery.from} volume={0.8} dur={40} />
      <OneShot src={g("pop.wav")} at={TL.delivery.from + 1} volume={0.4} dur={10} />

      {/* receipt printer + tear */}
      <OneShot src={g("printer.wav")} at={TL.receipt.from + 2} volume={0.5} dur={95} />
      <OneShot src={g("tear.wav")} at={TEAR_GLOBAL} volume={0.7} dur={20} />
    </>
  );
};
