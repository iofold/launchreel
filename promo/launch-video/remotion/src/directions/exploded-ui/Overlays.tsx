import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, DISPLAY, GROTESK, MONO, PHASE, smooth, backOut } from "./theme";
import { CREW } from "../../lib/brand";
import { PART_COUNT } from "./layers";
import { activeCrew, CREW_WIN, peelAmt, WORDS } from "./drivers";

// ---- white flashes -----------------------------------------------------------
export const Flashes: React.FC = () => {
  const f = useCurrentFrame();
  const freeze = smooth(f, [44, 46, 52], [0, 0.85, 0]); // the hard freeze
  const impact = smooth(f, [PHASE.implodeEnd - 3, PHASE.implodeEnd, PHASE.implodeEnd + 8], [0, 0.9, 0]); // the slam
  const op = Math.max(freeze, impact);
  if (op < 0.01) return null;
  return <AbsoluteFill style={{ background: "#FFF3D6", opacity: op, mixBlendMode: "screen" }} />;
};

// ---- hook stamp: "THIS TRAILER HAS 47 MOVING PARTS" --------------------------
export const HookStamp: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < 44 || f > 150) return null;
  const inS = spring({ frame: f - 46, fps, config: { damping: 11, stiffness: 150, mass: 0.9 } });
  const out = smooth(f, [132, 150], [0, 1]);
  const scale = (0.6 + inS * 0.4) * (1 - out * 0.25);
  const shake = f < 60 ? Math.sin(f * 3) * (60 - f) * 0.08 : 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          transform: `translateY(${-160 + shake}px) rotate(-3deg) scale(${scale})`,
          opacity: inS * (1 - out),
          background: COLORS.yellow,
          border: `5px solid ${COLORS.ink}`,
          boxShadow: `10px 10px 0 ${COLORS.ink}`,
          borderRadius: 14,
          padding: "16px 30px",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: COLORS.ink }}>THIS TRAILER HAS</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 74, lineHeight: 1, color: COLORS.ink, marginTop: 4 }}>
          {PART_COUNT} MOVING PARTS
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- crew assembly roster (left rail) ---------------------------------------
export const CrewRoster: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [a, b] = CREW_WIN;
  const appear = smooth(f, [PHASE.explodeEnd - 6, PHASE.explodeEnd + 30], [0, 1]);
  const leave = smooth(f, [b + 4, b + 24], [0, 1]);
  const vis = appear * (1 - leave);
  if (vis < 0.01) return null;
  const act = activeCrew(f);
  return (
    <div style={{ position: "absolute", left: 70, top: 250, opacity: vis, pointerEvents: "none" }}>
      <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: "rgba(255,243,214,0.7)", marginBottom: 14 }}>
        ASSEMBLY LINE · 5 AGENTS
      </div>
      {CREW.map((c, i) => {
        const slide = spring({ frame: f - (PHASE.explodeEnd + i * 5), fps, config: { damping: 14, stiffness: 120 } });
        const isActive = act === i;
        const done = f > a + ((b - a) / 5) * (i + 1);
        return (
          <div
            key={c.name}
            style={{
              transform: `translateX(${(1 - slide) * -80}px)`,
              opacity: slide,
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              background: isActive ? c.color : "rgba(255,253,244,0.96)",
              border: `3px solid ${COLORS.ink}`,
              boxShadow: isActive ? `6px 6px 0 ${COLORS.ink}` : `3px 3px 0 ${COLORS.ink}`,
              borderRadius: 12,
              padding: "9px 14px",
              width: 300,
              transition: "none",
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 8, background: isActive ? "rgba(255,255,255,0.25)" : c.color, border: `2px solid ${COLORS.ink}`, display: "grid", placeItems: "center", fontSize: 20 }}>{c.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 19, color: isActive ? "#fff" : COLORS.ink, lineHeight: 1 }}>{c.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: isActive ? "rgba(255,255,255,0.85)" : "#6b6252", marginTop: 2 }}>{c.role}</div>
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, color: isActive ? "#fff" : done ? COLORS.green : "rgba(23,19,13,0.25)" }}>
              {done ? "✓" : isActive ? "…" : "○"}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---- VO-b checklist: TYPE · TIMING · COLOR · CUT (sound-off legibility) ------
const WORD_COLOR: Record<string, string> = {
  headline: COLORS.purple,
  beats: COLORS.green,
  palette: COLORS.blue,
  scene: COLORS.pink,
};
export const WordChecklist: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = smooth(f, [228, 240], [0, 1]);
  const leave = smooth(f, [338, 360], [0, 1]);
  const vis = appear * (1 - leave);
  if (vis < 0.01) return null;
  return (
    <div style={{ position: "absolute", left: 82, top: 470, opacity: vis, pointerEvents: "none" }}>
      <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 3, color: "rgba(255,243,214,0.6)", marginBottom: 12 }}>47 DECISIONS · e.g.</div>
      {WORDS.map((w) => {
        const s = spring({ frame: f - w.at, fps, config: { damping: 12, stiffness: 170 } });
        const c = WORD_COLOR[w.layer];
        return (
          <div key={w.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, opacity: s, transform: `translateX(${(1 - s) * -30}px)` }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: c, border: `3px solid ${COLORS.ink}`, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontSize: 16, color: "#fff" }}>✓</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 34, color: "#fff", letterSpacing: 0.5 }}>{w.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// ---- watermark-peel payoff stamp --------------------------------------------
export const PeelStamp: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = PHASE.implodeEnd + 8;
  if (f < start || f > PHASE.endcardStart + 6) return null;
  const inS = spring({ frame: f - start, fps, config: { damping: 12, stiffness: 140 } });
  const p = peelAmt(f);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          transform: `translate(220px, -250px) rotate(4deg) scale(${0.7 + inS * 0.3})`,
          opacity: inS,
          background: COLORS.pink,
          border: `4px solid ${COLORS.ink}`,
          boxShadow: `7px 7px 0 ${COLORS.ink}`,
          borderRadius: 12,
          padding: "12px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, letterSpacing: 2, color: "#fff", opacity: p }}>WATERMARK REMOVED</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 40, color: "#fff", lineHeight: 1.1 }}>₹999</div>
      </div>
    </AbsoluteFill>
  );
};
