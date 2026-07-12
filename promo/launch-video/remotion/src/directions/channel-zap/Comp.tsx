// CHANNEL ZAP — retro broadcast channel-surf trailer for LaunchReel.
// Assembles the seven beats, the audio bed (music duck + VO + SFX), the
// channel-zap flashes, the guide→sign-off power-down, and a global CRT overlay.
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../../lib/brand";
import { T } from "./theme";
import { Scanlines, Vignette, ZapFlash } from "./Crt";
import { Hook } from "./scenes/Hook";
import { SadLaunch } from "./scenes/SadLaunch";
import { PasteUrl } from "./scenes/PasteUrl";
import { CrewRoom } from "./scenes/CrewRoom";
import { TrailerTv } from "./scenes/TrailerTv";
import { Guide } from "./scenes/Guide";
import { SignOff } from "./scenes/SignOff";

const gen = (f: string) => staticFile(`gen/channel-zap/${f}`);

// VO is diced into beat-aligned clips so it locks to the cut.
const VO = [
  { src: "vo1_tonight.mp3", from: 14, len: 54 },
  { src: "vo2_sixmonths.mp3", from: 96, len: 162 },
  { src: "vo3_change.mp3", from: 262, len: 56 },
  { src: "vo4_paste.mp3", from: 322, len: 161 },
  { src: "vo5_launchreel.mp3", from: 716, len: 50 },
  { src: "vo6_primetime.mp3", from: 772, len: 118 },
];
const DUCK: [number, number][] = VO.map((v) => [v.from, v.from + v.len]);

const ZAP_SFX = [94, 260, 358, 448, 526];

const inWindow = (f: number, wins: [number, number][]) => wins.some(([a, b]) => f >= a && f < b);

export const ChannelZap: React.FC = () => {
  const frame = useCurrentFrame();

  // music: swell in, duck under VO, fade at the sign-off tail.
  const musicVol = (f: number) => {
    const swell = interpolate(f, [0, 14], [0.2, 0.72], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const tail = interpolate(f, [884, 900], [1, 0.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const base = Math.min(swell, 0.72) * tail;
    return inWindow(f, DUCK) ? base * 0.38 : base;
  };

  // guide collapses to a dot as the tube powers down into the sign-off.
  const collY = interpolate(frame, [690, 699], [1, 0.014], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const collX = interpolate(frame, [697, 702], [1, 0.02], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const collBright = interpolate(frame, [692, 700], [1, 3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {/* ---- picture ---- */}
      <Sequence from={T.hook[0]} durationInFrames={T.hook[1] - T.hook[0]} name="Hook">
        <Hook />
      </Sequence>
      <Sequence from={T.ch01[0]} durationInFrames={T.ch01[1] - T.ch01[0]} name="CH01 Sad Launch">
        <SadLaunch />
      </Sequence>
      <Sequence from={T.ch02[0]} durationInFrames={T.ch02[1] - T.ch02[0]} name="CH02 Paste URL">
        <PasteUrl />
      </Sequence>
      <Sequence from={T.ch03[0]} durationInFrames={T.ch03[1] - T.ch03[0]} name="CH03 Crew">
        <CrewRoom />
      </Sequence>
      <Sequence from={T.ch04[0]} durationInFrames={T.ch04[1] - T.ch04[0]} name="CH04 Trailer TV">
        <TrailerTv />
      </Sequence>

      {/* guide, wrapped so it powers down into a dot */}
      <AbsoluteFill style={{ transform: `scale(${collX}, ${collY})`, transformOrigin: "center", filter: `brightness(${collBright})` }}>
        <Sequence from={T.guide[0]} durationInFrames={T.guide[1] - T.guide[0]} name="Guide">
          <Guide />
        </Sequence>
      </AbsoluteFill>

      <Sequence from={T.signoff[0]} durationInFrames={T.signoff[1] - T.signoff[0]} name="Sign-off">
        <SignOff />
      </Sequence>

      {/* ---- global CRT texture (subtle; scenes add their own where heavier) ---- */}
      <Vignette strength={0.42} />
      <Scanlines opacity={0.1} gap={3} />

      {/* ---- channel-zap flashes on top of the cut ---- */}
      {[T.ch01[0], T.ch02[0], T.ch03[0], T.ch04[0], T.guide[0]].map((c) => (
        <ZapFlash key={c} localCenter={c} width={6} />
      ))}

      {/* ---- audio bed ---- */}
      <Audio src={gen("music.mp3")} volume={musicVol} />
      <Sequence from={0} durationInFrames={22} name="sfx-hook-static">
        <Audio src={gen("static.mp3")} volume={0.5} />
      </Sequence>
      {ZAP_SFX.map((f) => (
        <Sequence key={f} from={f} durationInFrames={10} name={`sfx-zap-${f}`}>
          <Audio src={gen("zap.mp3")} volume={0.85} />
        </Sequence>
      ))}
      <Sequence from={688} durationInFrames={20} name="sfx-powerdown">
        <Audio src={gen("powerdown.mp3")} volume={0.8} />
      </Sequence>
      {VO.map((v) => (
        <Sequence key={v.src} from={v.from} durationInFrames={v.len} name={`vo-${v.src}`}>
          <Audio src={gen(v.src)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
