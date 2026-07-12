import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { DISPLAY, BODY } from "../fonts";
import { popShadow } from "./util";

/** Diagonal watermark ribbon for free-tier output. */
export const Watermark: React.FC<{ text?: string; ink: string; accent: string }> = ({
  text = "LAUNCHREEL · FREE TEASER",
  ink,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      top: 74,
      right: -120,
      transform: "rotate(38deg)",
      background: accent,
      color: "#fff",
      fontFamily: DISPLAY,
      fontSize: 26,
      letterSpacing: "0.06em",
      padding: "12px 150px",
      border: `4px solid ${ink}`,
      boxShadow: popShadow(ink, 6),
      zIndex: 50,
      opacity: 0.96,
    }}
  >
    {text}
  </div>
);

/** A pop callout chip that pops in and points at a UI region. */
export const Callout: React.FC<{
  text: string;
  fill: string;
  textColor: string;
  ink: string;
  delayFrame?: number;
  rotate?: number;
}> = ({ text, fill, textColor, ink, delayFrame = 0, rotate = -3 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delayFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(2)),
  });
  return (
    <div
      style={{
        display: "inline-block",
        background: fill,
        color: textColor,
        fontFamily: DISPLAY,
        fontSize: 34,
        padding: "12px 22px",
        border: `4px solid ${ink}`,
        borderRadius: 16,
        boxShadow: popShadow(ink, 6),
        transform: `scale(${p}) rotate(${rotate * p}deg)`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

/** Floating decorative emoji stickers (parallax drift) behind foreground content. */
export const StickerField: React.FC<{
  emojis?: string[];
  seed?: number;
}> = ({ emojis = ["🎬", "🍿", "⭐️", "🚀", "✨"], seed = 1 }) => {
  const frame = useCurrentFrame();
  // deterministic positions
  const items = emojis.map((e, i) => {
    const r = (n: number) => {
      const x = Math.sin((seed + i * 12.9898 + n * 78.233)) * 43758.5453;
      return x - Math.floor(x);
    };
    return {
      e,
      left: 6 + r(1) * 84,
      top: 8 + r(2) * 82,
      size: 70 + r(3) * 90,
      rot: -20 + r(4) * 40,
      drift: 8 + r(5) * 14,
      phase: r(6) * Math.PI * 2,
    };
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {items.map((it, i) => {
        const y = Math.sin(frame / 40 + it.phase) * it.drift;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${it.left}%`,
              top: `${it.top}%`,
              fontSize: it.size,
              opacity: 0.14,
              transform: `translateY(${y}px) rotate(${it.rot}deg)`,
            }}
          >
            {it.e}
          </span>
        );
      })}
    </AbsoluteFill>
  );
};

/** LaunchReel-style logo lockup: reel badge SVG + wordmark, or brand logo image. */
export const Wordmark: React.FC<{
  name: string;
  ink: string;
  accent: string;
  accent2: string;
  size?: number;
}> = ({ name, ink, accent, accent2, size = 64 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "0 0 auto" }}>
      <rect x="3" y="3" width="34" height="34" rx="11" fill={accent} stroke={ink} strokeWidth="3.5" />
      <circle cx="20" cy="20" r="10" fill={accent2} stroke={ink} strokeWidth="3" />
      <path d="M17 15 L26 20 L17 25 Z" fill={ink} />
    </svg>
    <span
      style={{
        fontFamily: DISPLAY,
        fontSize: size,
        color: ink,
        letterSpacing: "-0.03em",
        lineHeight: 1,
      }}
    >
      {name}
    </span>
  </div>
);

/** Kinetic word-by-word headline. Words spring up + settle, staggered. */
export const KineticHeadline: React.FC<{
  text: string;
  color: string;
  ink: string;
  fontSize: number;
  startFrame?: number;
  highlightWord?: number; // index to wrap in an accent chip
  highlightFill?: string;
  highlightText?: string;
  align?: "center" | "left";
  maxWidth?: number | string;
}> = ({
  text,
  color,
  ink,
  fontSize,
  startFrame = 0,
  highlightWord = -1,
  highlightFill,
  highlightText = "#fff",
  align = "center",
  maxWidth = "92%",
}) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: `${fontSize * 0.14}px ${fontSize * 0.28}px`,
        justifyContent: align === "center" ? "center" : "flex-start",
        maxWidth,
        fontFamily: DISPLAY,
        fontSize,
        lineHeight: 1.02,
        letterSpacing: "-0.02em",
      }}
    >
      {words.map((w, i) => {
        const d = startFrame + i * 3;
        const p = interpolate(frame - d, [0, 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.back(1.3)),
        });
        const y = interpolate(p, [0, 1], [fontSize * 0.7, 0]);
        const isHi = i === highlightWord && highlightFill;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: p,
              color: isHi ? highlightText : color,
              background: isHi ? highlightFill : "transparent",
              padding: isHi ? `0 ${fontSize * 0.18}px` : 0,
              border: isHi ? `${Math.max(3, fontSize * 0.06)}px solid ${ink}` : "none",
              borderRadius: isHi ? fontSize * 0.16 : 0,
              boxShadow: isHi ? popShadow(ink, Math.max(4, fontSize * 0.08)) : "none",
              transformOrigin: "bottom center",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
