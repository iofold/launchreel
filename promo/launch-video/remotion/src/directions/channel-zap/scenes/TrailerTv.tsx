// CH 04 (450–528f) — the finished trailer playing inside a CRT TV set, ON AIR.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CHROME } from "../../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "../theme";
import { Scanlines, Grain } from "../Crt";
import { ChannelBug, OnAir } from "../chrome";

// The mini launch-trailer that plays on the screen: quick branded cuts.
const MiniTrailer: React.FC<{ frame: number }> = ({ frame }) => {
  const cards = [
    { bg: COLORS.blue, fg: COLORS.paper, big: "LEDGERLY", small: "▶ a launch trailer" },
    { bg: COLORS.pink, fg: COLORS.paper, big: "Bookkeeping", small: "on autopilot" },
    { bg: COLORS.green, fg: COLORS.ink, big: "WE'RE LIVE", small: "30-sec · voiced · branded" },
  ];
  const per = 22;
  const idx = Math.min(cards.length - 1, Math.floor(frame / per));
  const local = frame - idx * per;
  const c = cards[idx];
  const inK = interpolate(local, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const kick = interpolate(local, [0, 6], [1.12, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: c.bg, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
      {/* motion accent shapes */}
      <div style={{ position: "absolute", width: 340, height: 340, borderRadius: 40, border: `6px solid ${c.fg}`, opacity: 0.22, transform: `rotate(${local * 3}deg)` }} />
      <div style={{ textAlign: "center", transform: `scale(${kick}) translateY(${(1 - inK) * 30}px)`, opacity: inK }}>
        <div style={{ fontFamily: ANTON, fontSize: 132, lineHeight: 0.9, color: c.fg, letterSpacing: 1 }}>{c.big}</div>
        <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 40, color: c.fg, marginTop: 10, opacity: 0.92 }}>{c.small}</div>
      </div>
    </AbsoluteFill>
  );
};

const Knob: React.FC = () => (
  <div style={{ width: 54, height: 54, borderRadius: 999, background: "#4a4a50", border: "4px solid #17171a", boxShadow: "inset -4px -4px 6px rgba(0,0,0,0.5)" }} />
);

export const TrailerTv: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 12, mass: 0.8 }, durationInFrames: 18 });
  const scale = interpolate(inS, [0, 1], [0.86, 1]);

  return (
    <AbsoluteFill style={{ background: COLORS.blue }}>
      {/* soft studio backdrop */}
      <AbsoluteFill style={{ background: `radial-gradient(70% 70% at 50% 40%, ${COLORS.sky} 0%, ${COLORS.blue} 70%)` }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          {/* TV cabinet */}
          <div
            style={{
              padding: 34,
              background: "#26262b",
              borderRadius: 40,
              border: `6px solid ${COLORS.ink}`,
              boxShadow: `16px 16px 0 ${COLORS.ink}`,
              display: "flex",
              gap: 26,
              alignItems: "stretch",
            }}
          >
            {/* screen */}
            <div style={{ position: "relative", width: 1080, height: 720, borderRadius: 26, overflow: "hidden", border: "10px solid #0c0c0e", background: "#000", boxShadow: "inset 0 0 60px rgba(0,0,0,0.7)" }}>
              <div style={{ position: "absolute", inset: 0, transform: "scale(1.02)" }}>
                <MiniTrailer frame={frame} />
              </div>
              <div style={{ position: "absolute", top: 20, left: 20 }}>
                <OnAir scale={1.1} />
              </div>
              <Scanlines opacity={0.28} gap={3} />
              <Grain opacity={0.14} />
              {/* glass curvature */}
              <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(120% 100% at 50% 0%, rgba(255,255,255,0.18), transparent 40%)" }} />
              <AbsoluteFill style={{ pointerEvents: "none", boxShadow: "inset 0 0 120px rgba(0,0,0,0.55)", borderRadius: 26 }} />
            </div>

            {/* control column */}
            <div style={{ width: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontFamily: ARCHIVO, fontSize: 20, color: COLORS.yellow, letterSpacing: 1, transform: "rotate(0deg)" }}>REEL-O-VISION</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Knob />
                <Knob />
              </div>
              <div style={{ width: 84, height: 150, borderRadius: 12, background: "repeating-linear-gradient(0deg,#3a3a40 0 6px,#1c1c20 6px 12px)" }} />
            </div>
          </div>

          <div style={{ fontFamily: ANTON, fontSize: 60, color: COLORS.paper, letterSpacing: 2, WebkitTextStroke: `4px ${COLORS.ink}`, paintOrder: "stroke fill" as React.CSSProperties["paintOrder"], textShadow: `5px 5px 0 ${COLORS.ink}` }}>
            YOUR TRAILER — READY IN MINUTES
          </div>
        </div>
      </AbsoluteFill>

      <ChannelBug n="04" tint={COLORS.pink} />
    </AbsoluteFill>
  );
};
