import React from "react";
import { Img, staticFile } from "remotion";
import { COLORS, DISPLAY, GROTESK, MONO, FW, FH } from "./theme";

// Each layer is a compact card at a fixed HOME rect inside the FW×FH frame box.
// Assembled (z=0) the cards nest into a believable trailer hero frame; exploded
// they separate by z-parallax + a radial push, each clearly visible & labeled.

export type Rect = { x: number; y: number; w: number; h: number };

// ---- content components (each fills its card) --------------------------------

const Bg: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden", background: `radial-gradient(120% 80% at 50% 16%, #4E74FF 0%, ${COLORS.blue} 48%, #2246D8 100%)` }}>
    <div style={{ position: "absolute", left: FW * 0.34, top: FH * 0.30, width: FW * 0.30, height: FW * 0.30, border: "3px solid rgba(255,255,255,0.22)", borderRadius: "50%" }} />
    <div style={{ position: "absolute", left: FW * 0.5, top: FH * 0.64, width: FW * 0.20, height: FW * 0.20, border: "3px solid rgba(255,255,255,0.20)", borderRadius: 8, transform: "rotate(20deg)" }} />
    <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)", backgroundSize: "46px 46px" }} />
    <div style={{ position: "absolute", inset: 10, border: "2px solid rgba(255,255,255,0.16)", borderRadius: 14 }} />
  </div>
);

const Headline: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", color: "#fff", fontFamily: DISPLAY, fontSize: 52, lineHeight: 1.05, letterSpacing: -1, textShadow: "0 3px 0 rgba(0,0,0,0.20)" }}>
    <div>Still doing<br />books at<br />midnight?</div>
  </div>
);

const Caption: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "0 14px", borderRadius: 10, background: "rgba(23,19,13,0.85)", color: "#fff", fontFamily: GROTESK, fontWeight: 600, fontSize: 21, textAlign: "center" }}>
    “…so we built one that never sleeps.”
  </div>
);

const SceneTag: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", borderRadius: 8, background: COLORS.ink, color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>
    SCENE 1 · HOOK
  </div>
);

const Logo: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", fontFamily: DISPLAY, fontSize: 22, color: "#fff", letterSpacing: 1 }}>
    LEDGERLY
  </div>
);

const PlayerUI: React.FC = () => (
  <div style={{ position: "absolute", inset: 0 }}>
    {/* play button (upper-center of card) */}
    <div style={{ position: "absolute", left: "50%", top: 40, transform: "translateX(-50%)", width: 92, height: 92, borderRadius: "50%", background: COLORS.yellow, border: `4px solid ${COLORS.ink}`, boxShadow: `5px 5px 0 ${COLORS.ink}`, display: "grid", placeItems: "center" }}>
      <div style={{ width: 0, height: 0, borderTop: "17px solid transparent", borderBottom: "17px solid transparent", borderLeft: `28px solid ${COLORS.ink}`, marginLeft: 6 }} />
    </div>
    {/* progress bar (bottom of card) */}
    <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: 5, background: "#fff", display: "grid", placeItems: "center" }}>
        <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${COLORS.ink}`, marginLeft: 2 }} />
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.4)" }}>
        <div style={{ width: "20%", height: "100%", borderRadius: 3, background: "#fff" }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 15, color: "#fff" }}>0:00</span>
    </div>
  </div>
);

const Waveform: React.FC = () => {
  const bars = 42;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 3, padding: "0 12px", borderRadius: 12, background: "rgba(14,11,6,0.55)", border: `2px solid ${COLORS.ink}` }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 10 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.4)) * 48;
        return <div key={i} style={{ flex: 1, height: h, borderRadius: 2, background: i % 7 === 0 ? COLORS.yellow : COLORS.green }} />;
      })}
    </div>
  );
};

const Beats: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6 }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{ borderRadius: 6, border: `2px solid ${COLORS.ink}`, background: i % 4 === 0 ? COLORS.green : "rgba(32,192,119,0.30)" }} />
    ))}
  </div>
);

const Palette: React.FC = () => {
  const chips = [COLORS.blue, COLORS.yellow, COLORS.pink, COLORS.ink, COLORS.green];
  const names = ["2F5BFF", "FFC93C", "FF3D8B", "17130D", "20C077"];
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", gap: 8 }}>
      {chips.map((c, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, borderRadius: 8, background: c, border: `3px solid ${COLORS.ink}` }} />
          <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 11, color: "#fff", textAlign: "center" }}>#{names[i]}</div>
        </div>
      ))}
    </div>
  );
};

const ShotCard: React.FC<{ src: string; posX: string; posY: string }> = ({ src, posX, posY }) => (
  <div style={{ position: "absolute", inset: 0, borderRadius: 12, overflow: "hidden", background: COLORS.paper }}>
    <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", objectPosition: `${posX} ${posY}` }} />
    <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", padding: "4px 8px", background: COLORS.ink, color: COLORS.paper, fontFamily: MONO, fontSize: 12, letterSpacing: 0.3 }}>scout ▸ ui capture</div>
  </div>
);

const Watermark: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 20 }}>
    <div style={{ position: "absolute", inset: "-30%", transform: "rotate(-26deg)", display: "flex", flexDirection: "column", gap: 30, opacity: 0.14 }}>
      {Array.from({ length: 12 }).map((_, r) => (
        <div key={r} style={{ whiteSpace: "nowrap", fontFamily: DISPLAY, fontSize: 22, color: "#fff", letterSpacing: 2 }}>
          {"LAUNCHREEL · FREE TEASER · ".repeat(5)}
        </div>
      ))}
    </div>
  </div>
);

// ---- layer registry ----------------------------------------------------------

export type LayerDef = {
  id: string;
  home: Rect; // position inside the FW×FH frame box
  z: number; // exploded translateZ (px)
  crew: number; // 0..4 owning crew
  color: string; // chip accent = crew color
  side: "L" | "R";
  title: string;
  sub: string;
  tag: string;
  hero: boolean; // visible in flat hook frame?
  panel: boolean; // draw a frosted part-panel behind content when exploded?
  content: React.ReactNode;
};

// Scout blue, Strategist purple, Director pink, Renderer green, Publisher orange
const CC = [COLORS.blue, COLORS.purple, COLORS.pink, COLORS.green, COLORS.orange];

export const LAYERS: LayerDef[] = [
  { id: "bg", home: { x: 0, y: 0, w: FW, h: FH }, z: -430, crew: 4, color: CC[4], side: "L", title: "CANVAS", sub: "1080×1920", tag: "PUBLISH", hero: true, panel: false, content: <Bg /> },
  { id: "shotA", home: { x: 250, y: 116, w: 214, h: 150 }, z: -330, crew: 0, color: CC[0], side: "R", title: "SCREENSHOT", sub: "delivery.png", tag: "SCOUT", hero: false, panel: false, content: <ShotCard src="assets/full-delivery.png" posX="20%" posY="8%" /> },
  { id: "shotB", home: { x: 22, y: 470, w: 214, h: 150 }, z: -268, crew: 0, color: CC[0], side: "L", title: "SCREENSHOT", sub: "jobboard.png", tag: "SCOUT", hero: false, panel: false, content: <ShotCard src="assets/full-jobboard.png" posX="60%" posY="30%" /> },
  { id: "palette", home: { x: 60, y: 726, w: 366, h: 74 }, z: -200, crew: 0, color: CC[0], side: "R", title: "BRAND", sub: "5 tokens", tag: "SCOUT", hero: false, panel: true, content: <Palette /> },
  { id: "beats", home: { x: 60, y: 250, w: 366, h: 40 }, z: -132, crew: 3, color: CC[3], side: "L", title: "BEAT GRID", sub: "100 BPM", tag: "RENDER", hero: false, panel: true, content: <Beats /> },
  { id: "wave", home: { x: 43, y: 560, w: 400, h: 84 }, z: -58, crew: 3, color: CC[3], side: "R", title: "VO TRACK", sub: "take 2", tag: "RENDER", hero: false, panel: false, content: <Waveform /> },
  { id: "scene", home: { x: 22, y: 22, w: 168, h: 36 }, z: 34, crew: 2, color: CC[2], side: "L", title: "SCENE ORDER", sub: "1 / 6", tag: "DIRECT", hero: true, panel: false, content: <SceneTag /> },
  { id: "caption", home: { x: 43, y: 690, w: 400, h: 56 }, z: 118, crew: 1, color: CC[1], side: "L", title: "CAPTION", sub: "beat-synced", tag: "STRAT", hero: false, panel: false, content: <Caption /> },
  { id: "headline", home: { x: 33, y: 300, w: 420, h: 190 }, z: 208, crew: 1, color: CC[1], side: "R", title: "HEADLINE", sub: "hook copy", tag: "STRAT", hero: true, panel: true, content: <Headline /> },
  { id: "logo", home: { x: 322, y: 22, w: 142, h: 32 }, z: 300, crew: 4, color: CC[4], side: "R", title: "WORDMARK", sub: "client lockup", tag: "PUBLISH", hero: true, panel: false, content: <Logo /> },
  { id: "player", home: { x: 0, y: 366, w: FW, h: 498 }, z: 372, crew: 2, color: CC[2], side: "R", title: "TRANSPORT", sub: "0:00 / 0:30", tag: "DIRECT", hero: true, panel: false, content: <PlayerUI /> },
  { id: "watermark", home: { x: 0, y: 0, w: FW, h: FH }, z: 462, crew: 4, color: CC[4], side: "L", title: "WATERMARK", sub: "₹999 removes it", tag: "PUBLISH", hero: true, panel: false, content: <Watermark /> },
];

export const PART_COUNT = 47;
