import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../lib/brand";
import { FONT_MONO, INK, paperNoiseUri } from "./theme";

// ---- Paper / table surface with grain + optional symmetric corner brackets ----
export const Paper: React.FC<{
  children?: React.ReactNode;
  color?: string;
  brackets?: boolean;
  vignette?: boolean;
}> = ({ children, color = COLORS.cream, brackets = false, vignette = true }) => (
  <AbsoluteFill style={{ backgroundColor: color }}>
    <AbsoluteFill style={{ backgroundImage: paperNoiseUri, backgroundSize: "180px 180px" }} />
    {vignette && (
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 55%, rgba(23,19,13,0.10) 100%)",
        }}
      />
    )}
    {brackets && <CornerBrackets />}
    {children}
  </AbsoluteFill>
);

const CornerBrackets: React.FC = () => {
  const m = 54;
  const L = 46;
  const w = 4;
  const c = INK;
  const H = ({ x, y, dx }: { x: number; y: number; dx: number }) => (
    <div style={{ position: "absolute", left: x, top: y, width: L, height: w, background: c, transform: `scaleX(${dx})`, transformOrigin: "left" }} />
  );
  const V = ({ x, y, dy }: { x: number; y: number; dy: number }) => (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: L, background: c, transform: `scaleY(${dy})`, transformOrigin: "top" }} />
  );
  return (
    <>
      <H x={m} y={m} dx={1} /> <V x={m} y={m} dy={1} />
      <H x={1920 - m - L} y={m} dx={1} /> <V x={1920 - m - w} y={m} dy={1} />
      <H x={m} y={1080 - m - w} dx={1} /> <V x={m} y={1080 - m - L} dy={1} />
      <H x={1920 - m - L} y={1080 - m - w} dx={1} /> <V x={1920 - m - w} y={1080 - m - L} dy={1} />
    </>
  );
};

// ---- Rubber stamp: scale-punch on impact + tiny settle shake, rough double border ----
export const Stamp: React.FC<{
  label: string;
  color?: string;
  rotate?: number;
  appearAt: number;
  x: number;
  y: number;
  scale?: number;
  sub?: string;
}> = ({ label, color = INK, rotate = -7, appearAt, x, y, scale = 1, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - appearAt;
  if (local < 0) return null;
  // punch: overshoot from 1.6 -> 1.0
  const s = spring({ frame: local, fps, config: { damping: 12, stiffness: 220, mass: 0.6 } });
  const punch = interpolate(s, [0, 1], [1.6, 1]);
  const op = interpolate(local, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  // 2px settle shake on the first ~6 frames
  const shake = local < 6 ? Math.sin(local * 3) * (2 * (1 - local / 6)) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%,-50%) rotate(${rotate}deg) scale(${punch * scale}) translateX(${shake}px)`,
        opacity: op,
        border: `4px solid ${color}`,
        borderRadius: 8,
        padding: "10px 18px",
        color,
        fontFamily: FONT_MONO,
        fontWeight: 500,
        letterSpacing: 1.5,
        textAlign: "center",
        background: "rgba(255,253,244,0.06)",
        boxShadow: `inset 0 0 0 2px ${color}`,
        textTransform: "uppercase",
        mixBlendMode: "multiply",
      }}
    >
      <div style={{ fontSize: 34, lineHeight: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 18, marginTop: 6, letterSpacing: 3 }}>{sub}</div>}
    </div>
  );
};

// ---- LaunchReel wordmark (play-circle + "Launch" ink + "Reel" pink pill) ----
export const Wordmark: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.26, fontFamily: FONT_MONO }}>
    <div
      style={{
        width: size * 1.02,
        height: size * 1.02,
        borderRadius: "50%",
        background: COLORS.blue,
        border: `${Math.max(3, size * 0.06)}px solid ${INK}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `${size * 0.08}px ${size * 0.08}px 0 ${INK}`,
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderTop: `${size * 0.24}px solid transparent`,
          borderBottom: `${size * 0.24}px solid transparent`,
          borderLeft: `${size * 0.38}px solid #FFFDF4`,
          marginLeft: size * 0.1,
        }}
      />
    </div>
    <div style={{ display: "flex", alignItems: "center", fontWeight: 500 }}>
      <span style={{ fontSize: size, color: INK, letterSpacing: -1 }}>Launch</span>
      <span
        style={{
          fontSize: size * 0.9,
          color: INK,
          background: COLORS.pink,
          border: `${Math.max(3, size * 0.05)}px solid ${INK}`,
          borderRadius: size * 0.22,
          padding: `${size * 0.02}px ${size * 0.18}px`,
          marginLeft: size * 0.16,
          boxShadow: `${size * 0.07}px ${size * 0.07}px 0 ${INK}`,
        }}
      >
        Reel
      </span>
    </div>
  </div>
);
