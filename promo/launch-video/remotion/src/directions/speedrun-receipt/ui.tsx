// Shared neo-brutalist chrome, rebuilt natively from public/assets/full-*.png.
// 3px ink borders, hard 6px offset shadows, chunky radii, brand colors.
import React from "react";
import { COLORS, CHROME } from "../../lib/brand";
import { UI } from "./fonts";

export const INK = COLORS.ink;

export const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: COLORS.paper,
  border: CHROME.border,
  boxShadow: CHROME.shadow,
  borderRadius: CHROME.radius,
  ...extra,
});

// ---- Top navigation bar (Launch·Reel wordmark + tabs + Simulate order) ------
type Tab = "Intake" | "Job Board" | "Delivery" | "Buildathon TV";
export const TopNav: React.FC<{ active: Tab }> = ({ active }) => {
  const tabs: Tab[] = ["Intake", "Job Board", "Delivery", "Buildathon TV"];
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1920,
        height: 78,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 44px",
        borderBottom: `4px solid ${INK}`,
        background: COLORS.cream,
        fontFamily: UI,
        boxSizing: "border-box",
      }}
    >
      <Wordmark size={30} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {tabs.map((t) => (
          <div
            key={t}
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: INK,
              padding: "9px 16px",
              borderRadius: 12,
              border: `3px solid ${INK}`,
              background: t === active ? COLORS.yellow : COLORS.paper,
              boxShadow: t === active ? `3px 3px 0 ${INK}` : "none",
            }}
          >
            {t}
          </div>
        ))}
        <div
          style={{
            fontSize: 19,
            fontWeight: 900,
            color: INK,
            padding: "9px 18px",
            borderRadius: 12,
            border: `3px solid ${INK}`,
            background: COLORS.pink,
            boxShadow: `3px 3px 0 ${INK}`,
            marginLeft: 6,
          }}
        >
          ▶ Simulate order
        </div>
      </div>
    </div>
  );
};

export const Wordmark: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.35, fontFamily: UI }}>
    <div
      style={{
        width: size * 1.25,
        height: size * 1.25,
        borderRadius: size * 0.4,
        background: COLORS.blue,
        border: `3px solid ${INK}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.8,
      }}
    >
      ▶
    </div>
    <div style={{ display: "flex", alignItems: "center", fontWeight: 900, fontSize: size, color: INK }}>
      <span>Launch</span>
      <span
        style={{
          background: COLORS.pink,
          color: COLORS.paper,
          padding: `${size * 0.05}px ${size * 0.28}px`,
          borderRadius: size * 0.35,
          border: `3px solid ${INK}`,
          marginLeft: size * 0.2,
        }}
      >
        Reel
      </span>
    </div>
  </div>
);

// ---- Small chip / eyebrow (NEW ORDER, LIVE PIPELINE, DELIVERED) -------------
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = COLORS.yellow,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      background: INK,
      color,
      fontFamily: UI,
      fontWeight: 900,
      fontSize: 18,
      letterSpacing: 1.5,
      padding: "7px 14px",
      borderRadius: 9,
    }}
  >
    {children}
  </div>
);

// ---- Context pill (🏷️ Ledgerly …) -----------------------------------------
export const Pill: React.FC<{ children: React.ReactNode; bg?: string }> = ({
  children,
  bg = COLORS.paper,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      background: bg,
      border: `3px solid ${INK}`,
      boxShadow: `3px 3px 0 ${INK}`,
      borderRadius: 999,
      padding: "8px 18px",
      fontFamily: UI,
      fontWeight: 800,
      fontSize: 20,
      color: INK,
    }}
  >
    {children}
  </div>
);

// ---- Status chip (waiting / working… / done ✓ / queued) --------------------
export const StatusChip: React.FC<{ state: string; color?: string }> = ({ state, color }) => {
  const done = state.startsWith("done");
  const working = state.startsWith("working");
  const bg = done ? COLORS.green : working ? COLORS.yellow : COLORS.paper;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: color ?? bg,
        border: `2.5px solid ${INK}`,
        borderRadius: 999,
        padding: "4px 14px",
        fontFamily: UI,
        fontWeight: 800,
        fontSize: 16,
        color: INK,
      }}
    >
      {state}
    </div>
  );
};
