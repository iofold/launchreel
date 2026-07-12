// CH 02 (262–360f) — PASTE A URL, staged like a game-show reveal: chasing
// bulbs, a flashing prompt, the URL types itself, then the button slams in.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CHROME } from "../../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "../theme";
import { ChannelBug, Badge } from "../chrome";

const Bulb: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const on = (i + Math.floor(frame / 2)) % 3 === 0;
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: on ? COLORS.yellow : "#8a6a10",
        border: `3px solid ${COLORS.ink}`,
        boxShadow: on ? `0 0 14px ${COLORS.yellow}` : "none",
      }}
    />
  );
};

const BulbRow: React.FC<{ n: number; base: number; frame: number; style: React.CSSProperties }> = ({ n, base, frame, style }) => (
  <div style={{ display: "flex", justifyContent: "space-between", ...style }}>
    {Array.from({ length: n }).map((_, i) => (
      <Bulb key={i} i={base + i} frame={frame} />
    ))}
  </div>
);

export const PasteUrl: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const url = "yourstartup.com";
  const shown = Math.max(0, Math.min(url.length, Math.floor((frame - 14) / 1.7)));
  const typed = url.slice(0, shown);
  const cursor = Math.floor(frame / 8) % 2 === 0;

  const flash = frame % 12 < 6;

  const btn = spring({ frame: frame - 54, fps, config: { damping: 10, mass: 0.8 }, durationInFrames: 16 });
  const press = frame > 84 ? 0.94 : 1;

  return (
    <AbsoluteFill style={{ background: COLORS.cream }}>
      {/* chasing-bulb marquee frame */}
      <AbsoluteFill style={{ padding: 54 }}>
        <div style={{ position: "relative", flex: 1, border: `6px solid ${COLORS.ink}`, borderRadius: 28, background: COLORS.paper, boxShadow: CHROME.shadow, overflow: "hidden" }}>
          <BulbRow n={22} base={0} frame={frame} style={{ position: "absolute", top: 14, left: 40, right: 40 }} />
          <BulbRow n={22} base={11} frame={frame} style={{ position: "absolute", bottom: 14, left: 40, right: 40 }} />

          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30, padding: 80 }}>
            <Badge label="NEW ORDER" />
            <div
              style={{
                fontFamily: ANTON,
                fontSize: 116,
                letterSpacing: 2,
                color: flash ? COLORS.pink : COLORS.blue,
                WebkitTextStroke: `8px ${COLORS.ink}`,
                paintOrder: "stroke fill" as React.CSSProperties["paintOrder"],
                textShadow: `7px 7px 0 ${COLORS.ink}`,
                transform: `rotate(-1.5deg) scale(${flash ? 1.03 : 1})`,
              }}
            >
              PASTE YOUR URL
            </div>

            {/* URL input, matches the intake field */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                width: 940,
                padding: "26px 30px",
                background: COLORS.paper,
                border: CHROME.border,
                borderRadius: CHROME.radius,
                boxShadow: CHROME.shadow,
              }}
            >
              <span style={{ fontSize: 42 }}>🔗</span>
              <span style={{ fontFamily: INTER, fontWeight: 800, fontSize: 46, color: COLORS.ink }}>
                {typed}
                <span style={{ opacity: cursor ? 1 : 0, color: COLORS.pink }}>|</span>
              </span>
            </div>

            {/* make my trailer button */}
            <div
              style={{
                transform: `scale(${interpolate(btn, [0, 1], [0.4, 1]) * press})`,
                opacity: interpolate(btn, [0, 1], [0, 1]),
                marginTop: 8,
                padding: "24px 52px",
                background: COLORS.blue,
                border: CHROME.border,
                borderRadius: CHROME.radius,
                boxShadow: `8px 8px 0 ${COLORS.ink}`,
                fontFamily: ARCHIVO,
                fontSize: 52,
                color: COLORS.paper,
              }}
            >
              🚀 Make my trailer
            </div>
          </AbsoluteFill>
        </div>
      </AbsoluteFill>

      <ChannelBug n="02" tint={COLORS.yellow} />
    </AbsoluteFill>
  );
};
