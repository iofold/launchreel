// Broadcast chrome: channel bug, ON AIR pill, lower-third ticker, section
// badge, and the LaunchReel wordmark — rebuilt to match the shipped UI.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, CHROME } from "../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "./theme";

// Top-right channel number, e.g. "CH 01".
export const ChannelBug: React.FC<{ n: string; tint?: string }> = ({ n, tint = COLORS.paper }) => (
  <div
    style={{
      position: "absolute",
      top: 40,
      right: 48,
      padding: "10px 20px 8px",
      background: tint,
      border: CHROME.border,
      borderRadius: 12,
      boxShadow: CHROME.shadowSm,
      fontFamily: ANTON,
      fontSize: 40,
      letterSpacing: 2,
      color: COLORS.ink,
      lineHeight: 1,
    }}
  >
    CH {n}
  </div>
);

// Pink "● ON AIR" pill with a pulsing dot.
export const OnAir: React.FC<{ style?: React.CSSProperties; scale?: number }> = ({ style, scale = 1 }) => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(frame / 4));
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10 * scale,
        padding: `${8 * scale}px ${16 * scale}px`,
        background: COLORS.pink,
        border: CHROME.border,
        borderRadius: 999,
        boxShadow: CHROME.shadowSm,
        fontFamily: ARCHIVO,
        fontSize: 22 * scale,
        color: COLORS.paper,
        letterSpacing: 1,
        ...style,
      }}
    >
      <span style={{ width: 12 * scale, height: 12 * scale, borderRadius: 999, background: COLORS.paper, opacity: pulse, boxShadow: `0 0 ${10 * pulse}px ${COLORS.paper}` }} />
      ON AIR
    </div>
  );
};

// Little section badge like "LIVE PIPELINE" — ink pill, yellow text.
export const Badge: React.FC<{ label: string; color?: string }> = ({ label, color = COLORS.yellow }) => (
  <div
    style={{
      display: "inline-block",
      padding: "8px 18px 6px",
      background: COLORS.ink,
      borderRadius: 10,
      fontFamily: ARCHIVO,
      fontSize: 24,
      letterSpacing: 3,
      color,
    }}
  >
    {label}
  </div>
);

// Lower-third marquee. `tag` is the colored label box; `items` scroll forever.
export const Ticker: React.FC<{
  tag: string;
  tagColor?: string;
  items: string[];
  speed?: number;
  y?: number;
}> = ({ tag, tagColor = COLORS.pink, items, speed = 4.5, y }) => {
  const frame = useCurrentFrame();
  const track = items.join("     ◆     ") + "     ◆     ";
  const offset = -((frame * speed) % 1600);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: y ?? 46,
        height: 74,
        display: "flex",
        alignItems: "stretch",
        background: COLORS.ink,
        borderTop: `4px solid ${COLORS.ink}`,
        boxShadow: CHROME.shadow,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 26px",
          background: tagColor,
          borderRight: `4px solid ${COLORS.ink}`,
          fontFamily: ARCHIVO,
          fontSize: 30,
          letterSpacing: 2,
          color: COLORS.paper,
          whiteSpace: "nowrap",
          zIndex: 2,
        }}
      >
        {tag}
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: offset,
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            fontFamily: INTER,
            fontWeight: 800,
            fontSize: 30,
            color: COLORS.cream,
          }}
        >
          <span>{track}</span>
          <span>{track}</span>
        </div>
      </div>
    </div>
  );
};

// LaunchReel wordmark = play-button glyph + "Launch" ink + "Reel" pink pill.
export const Wordmark: React.FC<{ size?: number }> = ({ size = 80 }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.22 }}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: COLORS.blue,
        border: `${Math.max(3, size * 0.05)}px solid ${COLORS.ink}`,
        boxShadow: `${size * 0.06}px ${size * 0.06}px 0 ${COLORS.ink}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          marginLeft: size * 0.08,
          borderTop: `${size * 0.2}px solid transparent`,
          borderBottom: `${size * 0.2}px solid transparent`,
          borderLeft: `${size * 0.32}px solid ${COLORS.yellow}`,
        }}
      />
    </div>
    <div style={{ display: "flex", alignItems: "center", fontFamily: ARCHIVO, fontSize: size, lineHeight: 1 }}>
      <span style={{ color: COLORS.ink }}>Launch</span>
      <span
        style={{
          marginLeft: size * 0.12,
          padding: `${size * 0.05}px ${size * 0.16}px ${size * 0.02}px`,
          background: COLORS.pink,
          color: COLORS.paper,
          border: `${Math.max(3, size * 0.05)}px solid ${COLORS.ink}`,
          borderRadius: size * 0.22,
          boxShadow: `${size * 0.05}px ${size * 0.05}px 0 ${COLORS.ink}`,
        }}
      >
        Reel
      </span>
    </div>
  </div>
);

// Small helper: a spring-ish stamp-in progress 0..1 for `local` past `start`.
export const stampIn = (local: number, start: number, len = 10) =>
  interpolate(local, [start, start + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
