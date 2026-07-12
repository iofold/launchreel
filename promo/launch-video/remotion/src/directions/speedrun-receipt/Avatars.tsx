// The five crew avatars, rebuilt as chunky SVG faces from full-jobboard.png.
import React from "react";
import { COLORS } from "../../lib/brand";

const INK = COLORS.ink;

const Tile: React.FC<{ color: string; children: React.ReactNode; size: number }> = ({
  color,
  children,
  size,
}) => (
  <svg width={size} height={size} viewBox="0 0 96 96" style={{ display: "block" }}>
    <rect x="6" y="6" width="84" height="84" rx="26" fill={color} stroke={INK} strokeWidth="5" />
    {children}
  </svg>
);

const eye = (cx: number, cy: number, r = 11) => (
  <>
    <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth="3" />
    <circle cx={cx} cy={cy + 1} r={r * 0.42} fill={INK} />
  </>
);

export const AgentFace: React.FC<{ name: string; size?: number }> = ({ name, size = 92 }) => {
  switch (name) {
    case "Scout":
      return (
        <Tile color={COLORS.blue} size={size}>
          {eye(35, 46, 13)}
          {eye(63, 46, 13)}
          <path d="M34 68 Q48 76 62 68" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
        </Tile>
      );
    case "Strategist":
      return (
        <Tile color={COLORS.purple} size={size}>
          {/* idea bulb */}
          <line x1="48" y1="18" x2="48" y2="8" stroke={INK} strokeWidth="4" />
          <circle cx="48" cy="8" r="7" fill={COLORS.yellow} stroke={INK} strokeWidth="3.5" />
          {eye(37, 50, 10)}
          {eye(61, 50, 10)}
          <path d="M37 70 Q48 78 61 70" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
        </Tile>
      );
    case "Director":
      return (
        <Tile color={COLORS.pink} size={size}>
          {/* beret */}
          <path d="M26 26 Q48 8 70 24 Q60 30 30 30 Z" fill={INK} />
          <circle cx="70" cy="22" r="4" fill={INK} />
          {eye(37, 52, 10)}
          {eye(61, 52, 10)}
          <path d="M36 70 Q48 80 62 70" stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round" />
        </Tile>
      );
    case "Renderer":
      return (
        <Tile color={COLORS.green} size={size}>
          {/* antenna */}
          <line x1="48" y1="16" x2="48" y2="7" stroke={INK} strokeWidth="4" />
          <circle cx="48" cy="7" r="5" fill={COLORS.pink} stroke={INK} strokeWidth="3" />
          {/* robot eyes */}
          <rect x="26" y="40" width="18" height="15" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
          <rect x="52" y="40" width="18" height="15" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />
          <circle cx="35" cy="47.5" r="3.5" fill={INK} />
          <circle cx="61" cy="47.5" r="3.5" fill={INK} />
          {/* mouth grille */}
          <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
            <line x1="38" y1="68" x2="38" y2="76" />
            <line x1="48" y1="68" x2="48" y2="76" />
            <line x1="58" y1="68" x2="58" y2="76" />
          </g>
        </Tile>
      );
    case "Publisher":
      return (
        <Tile color={COLORS.orange} size={size}>
          {/* signal / megaphone hint */}
          <path d="M70 20 L82 14 L82 30 Z" fill={INK} />
          {eye(37, 48, 11)}
          {eye(61, 48, 11)}
          <path d="M36 66 Q48 78 62 66 Q52 72 36 66 Z" fill={INK} />
        </Tile>
      );
    default:
      return <Tile color={COLORS.sky} size={size}>{eye(37, 48)}{eye(61, 48)}</Tile>;
  }
};
