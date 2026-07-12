// HOOK (0–2s) — white-hot yellow title card, giant ink type, gamer/speedrun flavor.
// The global timer (top-right) is already ticking; this card sells "ANY% SPEEDRUN".
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../../../lib/brand";
import { UI, DOT } from "../fonts";

const INK = COLORS.ink;

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slam = spring({ frame, fps, config: { damping: 11, mass: 0.8 } });
  const scale = interpolate(slam, [0, 1], [1.25, 1]);
  const startFlash = interpolate(frame, [0, 6], [1, 0], { extrapolateRight: "clamp" });
  const go = interpolate(frame, [3, 8, 20, 26], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // outgoing wipe near the end (cut to intake handled by Comp)
  const out = interpolate(frame, [52, 60], [0, 1], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.yellow, fontFamily: UI, overflow: "hidden" }}>
      {/* speed streaks */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: -400,
            top: 120 + i * 190,
            width: 2600,
            height: 10,
            background: INK,
            opacity: 0.08,
            transform: `translateX(${interpolate((frame + i * 7) % 60, [0, 60], [0, 300])}px) skewX(-20deg)`,
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: 110,
          top: 300,
          transform: `scale(${scale})`,
          transformOrigin: "left center",
        }}
      >
        <div
          style={{
            fontFamily: DOT,
            fontSize: 60,
            color: COLORS.pink,
            letterSpacing: 2,
            lineHeight: 1,
            textShadow: `3px 3px 0 ${INK}`,
          }}
        >
          ▶ LAUNCHREEL — ANY% SPEEDRUN
        </div>
        <div style={{ fontWeight: 900, fontSize: 200, lineHeight: 0.92, color: INK, letterSpacing: -4, marginTop: 6 }}>
          LAUNCH
          <br />
          TRAILER
        </div>
        <div
          style={{
            marginTop: 24,
            display: "inline-flex",
            background: COLORS.pink,
            color: COLORS.paper,
            border: `4px solid ${INK}`,
            boxShadow: `6px 6px 0 ${INK}`,
            borderRadius: 14,
            padding: "10px 22px",
            fontWeight: 900,
            fontSize: 34,
            letterSpacing: 1,
          }}
        >
          REAL-TIME · NO CUTS · ONE TAKE
        </div>
      </div>

      {/* GO! flash near the start line */}
      {go > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: 1180,
            top: 470,
            transform: `rotate(-8deg) scale(${interpolate(go, [0, 1], [0.7, 1])})`,
            opacity: go,
            fontWeight: 900,
            fontSize: 150,
            color: COLORS.green,
            WebkitTextStroke: `6px ${INK}`,
          }}
        >
          GO!
        </div>
      )}

      {startFlash > 0.01 && <AbsoluteFill style={{ background: "#fff", opacity: startFlash }} />}
      {out > 0 && <AbsoluteFill style={{ background: "#fff", opacity: out }} />}
    </AbsoluteFill>
  );
};
