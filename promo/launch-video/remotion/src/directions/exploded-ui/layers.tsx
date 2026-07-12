import React from "react";
import { Img, staticFile } from "remotion";
import { COLORS, DISPLAY, GROTESK, MONO, FW, FH } from "./theme";

// ---- shared bits -------------------------------------------------------------

const Shape: React.FC<{ x: number; y: number; s: number; sq?: boolean; rot?: number }>
  = ({ x, y, s, sq, rot = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: s,
      height: s,
      border: "3px solid rgba(255,255,255,0.30)",
      borderRadius: sq ? 8 : "50%",
      transform: `rotate(${rot}deg)`,
    }}
  />
);

const ShotCard: React.FC<{ src: string; posX: string; posY: string; caption: string }>
  = ({ src, posX, posY, caption }) => (
  <div
    style={{
      position: "absolute",
      inset: "18% 12%",
      borderRadius: 14,
      border: `4px solid ${COLORS.ink}`,
      boxShadow: `7px 7px 0 ${COLORS.ink}`,
      overflow: "hidden",
      background: COLORS.paper,
    }}
  >
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${posX} ${posY}`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: "100%",
        padding: "6px 10px",
        background: COLORS.ink,
        color: COLORS.paper,
        fontFamily: MONO,
        fontSize: 15,
        letterSpacing: 0.3,
      }}
    >
      {caption}
    </div>
  </div>
);

// ---- flat-frame content per layer -------------------------------------------

const Bg: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: 22,
      background: `radial-gradient(120% 80% at 50% 18%, #4E74FF 0%, ${COLORS.blue} 46%, #2246D8 100%)`,
      overflow: "hidden",
    }}
  >
    <Shape x={FW * 0.36} y={FH * 0.30} s={FW * 0.26} />
    <Shape x={FW * 0.5} y={FH * 0.62} s={FW * 0.2} sq rot={20} />
    {/* faint film-grid */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    />
  </div>
);

const Headline: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: "40%",
      padding: "0 40px",
      textAlign: "center",
      color: "#fff",
      fontFamily: DISPLAY,
      fontSize: 58,
      lineHeight: 1.04,
      letterSpacing: -1,
      textShadow: "0 3px 0 rgba(0,0,0,0.18)",
    }}
  >
    Still doing books<br />at midnight?
  </div>
);

const Caption: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: "8%",
      right: "8%",
      bottom: "16%",
      padding: "9px 14px",
      borderRadius: 10,
      background: "rgba(23,19,13,0.82)",
      color: "#fff",
      fontFamily: GROTESK,
      fontWeight: 600,
      fontSize: 22,
      textAlign: "center",
    }}
  >
    “…so we built one that never sleeps.”
  </div>
);

const SceneTag: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 22,
      top: 22,
      padding: "7px 12px",
      borderRadius: 8,
      background: COLORS.ink,
      color: "#fff",
      fontFamily: MONO,
      fontWeight: 700,
      fontSize: 16,
      letterSpacing: 0.5,
    }}
  >
    SCENE 1 · HOOK
  </div>
);

const Logo: React.FC = () => (
  <div
    style={{
      position: "absolute",
      right: 22,
      top: 22,
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontFamily: DISPLAY,
      fontSize: 20,
      color: "#fff",
    }}
  >
    <span style={{ letterSpacing: 1 }}>LEDGERLY</span>
  </div>
);

const Transport: React.FC = () => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
    {/* play button */}
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: FH * 0.5 - 44,
        transform: "translateX(-50%)",
        width: 88,
        height: 88,
        borderRadius: "50%",
        background: COLORS.yellow,
        border: `4px solid ${COLORS.ink}`,
        boxShadow: `5px 5px 0 ${COLORS.ink}`,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderTop: "16px solid transparent",
          borderBottom: "16px solid transparent",
          borderLeft: `26px solid ${COLORS.ink}`,
          marginLeft: 6,
        }}
      />
    </div>
    {/* progress bar */}
    <div style={{ position: "absolute", left: 20, right: 20, bottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: 5, background: "#fff", display: "grid", placeItems: "center" }}>
        <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${COLORS.ink}`, marginLeft: 2 }} />
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.35)" }}>
        <div style={{ width: "18%", height: "100%", borderRadius: 3, background: "#fff" }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 15, color: "#fff" }}>0:00</span>
    </div>
  </div>
);

const Waveform: React.FC = () => {
  const bars = 46;
  return (
    <div
      style={{
        position: "absolute",
        left: "6%",
        right: "6%",
        top: "58%",
        height: 84,
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "0 10px",
        borderRadius: 12,
        background: "rgba(255,253,244,0.10)",
        border: "2px solid rgba(255,255,255,0.25)",
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const h = 12 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.4)) * 56;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 2,
              background: i % 7 === 0 ? COLORS.yellow : COLORS.green,
              opacity: 0.92,
            }}
          />
        );
      })}
    </div>
  );
};

const Beats: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: "8%",
      right: "8%",
      top: "30%",
      display: "grid",
      gridTemplateColumns: "repeat(8,1fr)",
      gap: 6,
    }}
  >
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        style={{
          height: 34,
          borderRadius: 6,
          border: `2px solid ${COLORS.ink}`,
          background: i % 4 === 0 ? COLORS.green : "rgba(32,192,119,0.28)",
        }}
      />
    ))}
  </div>
);

const Palette: React.FC = () => {
  const chips = [COLORS.blue, COLORS.yellow, COLORS.pink, COLORS.ink, COLORS.green];
  const names = ["#2F5BFF", "#FFC93C", "#FF3D8B", "#17130D", "#20C077"];
  return (
    <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "30%", display: "flex", gap: 8 }}>
      {chips.map((c, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ height: 46, borderRadius: 8, background: c, border: `3px solid ${COLORS.ink}` }} />
          <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 11, color: "#fff" }}>{names[i]}</div>
        </div>
      ))}
    </div>
  );
};

const Watermark: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 22 }}>
    <div
      style={{
        position: "absolute",
        inset: "-30%",
        transform: "rotate(-24deg)",
        display: "flex",
        flexDirection: "column",
        gap: 40,
        opacity: 0.16,
      }}
    >
      {Array.from({ length: 9 }).map((_, r) => (
        <div key={r} style={{ whiteSpace: "nowrap", fontFamily: DISPLAY, fontSize: 30, color: "#fff", letterSpacing: 3 }}>
          {"LAUNCHREEL ▸ FREE TEASER ".repeat(4)}
        </div>
      ))}
    </div>
  </div>
);

// ---- layer registry ----------------------------------------------------------

export type LayerDef = {
  id: string;
  z: number; // exploded translateZ (px); assembled = 0
  crew: number; // 0..4 owning crew index
  color: string; // chip accent (crew color)
  side: "L" | "R"; // callout chip side
  chipY: number; // callout vertical anchor within plane (px from top)
  title: string; // callout title
  sub: string; // callout sub / value
  tag: string; // crew stamp
  hero: boolean; // visible in the flat hook frame?
  content: React.ReactNode;
};

// crew colors: Scout blue, Strategist purple, Director pink, Renderer green, Publisher orange
const CC = [COLORS.blue, COLORS.purple, COLORS.pink, COLORS.green, COLORS.orange];

export const LAYERS: LayerDef[] = [
  { id: "bg", z: -420, crew: 4, color: CC[4], side: "L", chipY: 120, title: "CANVAS", sub: "1080×1920", tag: "PUBLISH", hero: true, content: <Bg /> },
  { id: "shotA", z: -336, crew: 0, color: CC[0], side: "R", chipY: 170, title: "SCREENSHOT", sub: "delivery.png", tag: "SCOUT", hero: false, content: <ShotCard src="assets/full-delivery.png" posX="18%" posY="30%" caption="scout ▸ ui capture" /> },
  { id: "shotB", z: -262, crew: 0, color: CC[0], side: "L", chipY: 250, title: "SCREENSHOT", sub: "upgrade.png", tag: "SCOUT", hero: false, content: <ShotCard src="assets/mock-3-delivery.png" posX="80%" posY="72%" caption="scout ▸ ui capture" /> },
  { id: "palette", z: -190, crew: 0, color: CC[0], side: "R", chipY: 560, title: "BRAND", sub: "#2F5BFF", tag: "SCOUT", hero: false, content: <Palette /> },
  { id: "beats", z: -120, crew: 3, color: CC[3], side: "L", chipY: 300, title: "BEAT GRID", sub: "100 BPM", tag: "RENDER", hero: false, content: <Beats /> },
  { id: "wave", z: -52, crew: 3, color: CC[3], side: "R", chipY: 540, title: "VO TRACK", sub: "take 2", tag: "RENDER", hero: false, content: <Waveform /> },
  { id: "scene", z: 28, crew: 2, color: CC[2], side: "L", chipY: 40, title: "SCENE ORDER", sub: "1 / 6", tag: "DIRECT", hero: true, content: <SceneTag /> },
  { id: "caption", z: 104, crew: 1, color: CC[1], side: "L", chipY: 700, title: "CAPTION", sub: "beat-synced", tag: "STRAT", hero: false, content: <Caption /> },
  { id: "headline", z: 190, crew: 1, color: CC[1], side: "R", chipY: 360, title: "HEADLINE", sub: "hook copy", tag: "STRAT", hero: true, content: <Headline /> },
  { id: "transport", z: 272, crew: 2, color: CC[2], side: "R", chipY: 470, title: "TIMELINE", sub: "0:00 / 0:30", tag: "DIRECT", hero: true, content: <Transport /> },
  { id: "logo", z: 352, crew: 4, color: CC[4], side: "R", chipY: 40, title: "WORDMARK", sub: "client lockup", tag: "PUBLISH", hero: true, content: <Logo /> },
  { id: "watermark", z: 452, crew: 4, color: CC[4], side: "L", chipY: 430, title: "WATERMARK", sub: "₹999 removes it", tag: "PUBLISH", hero: true, content: <Watermark /> },
];

export const PART_COUNT = 47;
