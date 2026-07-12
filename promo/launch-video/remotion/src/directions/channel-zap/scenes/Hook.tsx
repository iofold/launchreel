// HOOK (0–96f): analog static → brand SMPTE bars SLAM → headline stamp.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../../lib/brand";
import { ANTON } from "../theme";
import { Static } from "../Crt";
import { ChannelBug } from "../chrome";

// SMPTE-style bars remapped to the brand palette.
const BARS = [COLORS.yellow, COLORS.sky, COLORS.green, COLORS.pink, COLORS.purple, COLORS.orange, COLORS.blue];
const MID = [COLORS.blue, COLORS.ink, COLORS.purple, COLORS.ink, COLORS.green, COLORS.ink, COLORS.yellow];

const SmpteBars: React.FC = () => (
  <AbsoluteFill>
    <div style={{ display: "flex", height: "72%" }}>
      {BARS.map((c, i) => (
        <div key={i} style={{ flex: 1, background: c }} />
      ))}
    </div>
    <div style={{ display: "flex", height: "8%" }}>
      {MID.map((c, i) => (
        <div key={i} style={{ flex: 1, background: c }} />
      ))}
    </div>
    <div style={{ display: "flex", height: "20%" }}>
      <div style={{ width: "16.66%", background: COLORS.ink }} />
      <div style={{ width: "16.66%", background: COLORS.paper }} />
      <div style={{ width: "16.66%", background: COLORS.purple }} />
      <div style={{ width: "16.66%", background: COLORS.ink }} />
      <div style={{ flex: 1, background: COLORS.cream }} />
      <div style={{ width: 120, background: COLORS.ink }} />
      <div style={{ width: 120, background: COLORS.pink }} />
      <div style={{ width: 120, background: COLORS.ink }} />
    </div>
  </AbsoluteFill>
);

const Line: React.FC<{ text: string; delay: number; rot: number; frame: number; fps: number }> = ({
  text,
  delay,
  rot,
  frame,
  fps,
}) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 }, durationInFrames: 18 });
  const pop = interpolate(s, [0, 1], [1.35, 1]);
  const op = interpolate(frame - delay, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: ANTON,
        fontSize: 168,
        lineHeight: 0.94,
        letterSpacing: 2,
        color: COLORS.ink,
        WebkitTextStroke: `12px ${COLORS.paper}`,
        paintOrder: "stroke fill" as React.CSSProperties["paintOrder"],
        textShadow: `9px 9px 0 ${COLORS.pink}`,
        transform: `scale(${pop}) rotate(${rot}deg)`,
        opacity: op,
      }}
    >
      {text}
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // bars open like a tube warming up (thin line -> full)
  const open = interpolate(frame, [12, 20], [0.04, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // static heavy at first, flickers over bars, then clears
  const snow = interpolate(frame, [0, 12, 20, 30], [1, 0.9, 0.5, 0.08], { extrapolateRight: "clamp" });
  // pre-blackouts
  const blk = frame < 3 || (frame > 5 && frame < 7) ? 1 : 0;

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <AbsoluteFill style={{ transform: `scaleY(${open})`, transformOrigin: "center" }}>
        <SmpteBars />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 6 }}>
        <Line text="YOUR LAUNCH" delay={20} rot={-2} frame={frame} fps={fps} />
        <Line text="DESERVES" delay={26} rot={1.4} frame={frame} fps={fps} />
        <Line text="PRIMETIME" delay={32} rot={-1} frame={frame} fps={fps} />
      </AbsoluteFill>

      {frame > 15 ? <ChannelBug n="00" tint={COLORS.paper} /> : null}

      <Static opacity={snow} mono />
      <AbsoluteFill style={{ background: COLORS.ink, opacity: blk }} />
    </AbsoluteFill>
  );
};
