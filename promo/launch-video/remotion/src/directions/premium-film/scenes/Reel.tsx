import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../../../lib/brand";
import { Letterbox } from "../lib/effects";
import { FONT } from "../lib/type";
import { interpolateEase } from "../components";

const CELL_W = 780;
const CELL_H = Math.round((CELL_W * 577) / 1280); // preserve mock aspect (1280×577)
const GAP = 52;
const PAD_X = 52;
const SPROCKET_MARGIN = 58;
const STRIP_H = CELL_H + SPROCKET_MARGIN * 2;
const N = 4;
const STRIP_W = PAD_X * 2 + N * CELL_W + (N - 1) * GAP;
const STRIP_TOP = 132 + (816 - STRIP_H) / 2; // centered inside the 2.35:1 band

const CELLS = [
  { src: "assets/mock-1.png", label: "INTAKE" },
  { src: "assets/mock-2-jobboard.png", label: "THE CREW" },
  { src: "assets/mock-3-delivery.png", label: "DELIVERED" },
  { src: "assets/mock-4-tv.png", label: "PREMIERE" },
];

const Sprockets: React.FC<{ y: number }> = ({ y }) => {
  const holes: React.ReactNode[] = [];
  const spacing = 66;
  for (let x = 24; x < STRIP_W - 24; x += spacing) {
    holes.push(
      <div
        key={x}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 30,
          height: 40,
          borderRadius: 6,
          background: "#0c0a08",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.6)",
        }}
      />,
    );
  }
  return <>{holes}</>;
};

// 12–18s · THE REEL (deterministic Remotion) — real product frames pulled
// through the projector gate on a 35mm strip. Letterboxed 2.35:1 for this beat.
export const Reel: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  // slow continuous pan across the strip
  const panT = interpolateEase(interpolate(frame, [8, duration - 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const pan = interpolate(panT, [0, 1], [-24, -(STRIP_W - 1920 + 24)]);

  // subtle projector flicker
  const flicker = 0.95 + 0.05 * Math.abs(Math.sin(frame * 0.9));
  // letterbox wipes in over the first ~12 frames
  const barReveal = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const slate = interpolate(frame, [14, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0806" }}>
      {/* warm projector gate glow behind the strip */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 60% 90% at 50% 50%, rgba(255,213,120,0.20) 0%, rgba(255,190,90,0.06) 40%, rgba(0,0,0,0) 72%)",
        }}
      />

      {/* the film strip */}
      <div
        style={{
          position: "absolute",
          top: STRIP_TOP,
          left: 0,
          width: STRIP_W,
          height: STRIP_H,
          transform: `translateX(${pan}px)`,
          background: "linear-gradient(180deg,#1a1410 0%,#221a14 50%,#1a1410 100%)",
          opacity: flicker,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        <Sprockets y={12} />
        <Sprockets y={STRIP_H - 52} />

        <div
          style={{
            position: "absolute",
            top: SPROCKET_MARGIN,
            left: PAD_X,
            right: PAD_X,
            height: CELL_H,
            display: "flex",
            gap: GAP,
          }}
        >
          {CELLS.map((c) => (
            <div key={c.src} style={{ position: "relative", width: CELL_W, height: CELL_H }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  border: "2px solid rgba(0,0,0,0.55)",
                  background: COLORS.cream,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                <Img
                  src={staticFile(c.src)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                />
              </div>
              {/* film-edge frame label */}
              <div
                style={{
                  position: "absolute",
                  bottom: -SPROCKET_MARGIN + 14,
                  left: 4,
                  fontFamily: FONT.roman,
                  fontSize: 20,
                  letterSpacing: "0.4em",
                  color: "rgba(240,225,190,0.72)",
                }}
              >
                {c.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* soft darken at the very left/right so frames feel "pulled through" a gate */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(10,8,6,0.9) 0%, rgba(10,8,6,0) 16%, rgba(10,8,6,0) 84%, rgba(10,8,6,0.9) 100%)",
        }}
      />

      <Letterbox barPx={132} reveal={barReveal} />

      {/* slate line in the top bar */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: slate,
          fontFamily: FONT.roman,
          fontSize: 22,
          letterSpacing: "0.5em",
          color: "rgba(240,225,190,0.8)",
        }}
      >
        SHOT ON YOUR REAL PRODUCT
      </div>
    </AbsoluteFill>
  );
};
