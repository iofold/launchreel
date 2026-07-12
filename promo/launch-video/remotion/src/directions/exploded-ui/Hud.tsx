import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, MONO, PHASE, smooth } from "./theme";
import { PART_COUNT } from "./layers";

const Tick: React.FC<{ pos: React.CSSProperties }> = ({ pos }) => (
  <div style={{ position: "absolute", width: 26, height: 26, ...pos }}>
    <div style={{ position: "absolute", inset: 0, borderTop: `2px solid ${COLORS.yellow}`, borderLeft: `2px solid ${COLORS.yellow}` }} />
  </div>
);

// Registration-mark HUD framing the teardown — sells "engineering diagram".
export const Hud: React.FC = () => {
  const f = useCurrentFrame();
  const op =
    smooth(f, [PHASE.pullEnd - 4, PHASE.pullEnd + 20], [0, 1]) *
    smooth(f, [PHASE.implodeStart - 6, PHASE.implodeStart + 14], [1, 0]);
  if (op < 0.01) return null;

  const M = 54;
  return (
    <AbsoluteFill style={{ opacity: op, pointerEvents: "none" }}>
      <Tick pos={{ left: M, top: M }} />
      <Tick pos={{ right: M, top: M, transform: "scaleX(-1)" }} />
      <Tick pos={{ left: M, bottom: M, transform: "scaleY(-1)" }} />
      <Tick pos={{ right: M, bottom: M, transform: "scale(-1,-1)" }} />

      <div style={{ position: "absolute", left: M + 6, top: M - 4, fontFamily: MONO, fontSize: 15, letterSpacing: 2, color: "rgba(255,243,214,0.75)" }}>
        FIG. 02 — EXPLODED VIEW
      </div>
      <div style={{ position: "absolute", right: M + 6, top: M - 6, textAlign: "right" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: "rgba(255,243,214,0.55)" }}>PART COUNT</div>
        <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: COLORS.yellow, lineHeight: 1 }}>{PART_COUNT}</div>
      </div>
      <div style={{ position: "absolute", left: M + 6, bottom: M - 2, fontFamily: MONO, fontSize: 13, letterSpacing: 1.5, color: "rgba(255,243,214,0.5)" }}>
        LAUNCHREEL · TRAILER ANATOMY
      </div>
    </AbsoluteFill>
  );
};
