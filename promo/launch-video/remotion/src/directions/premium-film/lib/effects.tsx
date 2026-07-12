import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// ---- timing helpers -------------------------------------------------------

// Symmetric fade envelope: 0 at the edges, 1 in the middle. Used for the
// "fade through black" beats between cinematic shots and for type reveals.
export const envelope = (
  frame: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
) =>
  interpolate(
    frame,
    [0, fadeIn, duration - fadeOut, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

// One-directional ease-in reveal that then holds.
export const revealHold = (frame: number, start: number, len: number) =>
  interpolate(frame, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// ---- grade layers ---------------------------------------------------------

// Animated film grain — SVG fractal noise re-seeded every frame, laid over the
// Veo beats in "overlay" so it modulates both highlights and shadows.
export const FilmGrain: React.FC<{ opacity?: number; id?: string }> = ({
  opacity = 0.09,
  id = "pf-grain",
}) => {
  const frame = useCurrentFrame();
  const seed = frame % 137;
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={seed}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

// Soft cinematic vignette. `strength` = darkness at the corners.
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse 78% 78% at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

// 2.35:1 anamorphic letterbox (used on the filmstrip beat only). At 1920x1080
// the visible band is 1920/2.35 ≈ 817px, so each bar is ≈132px.
export const Letterbox: React.FC<{ barPx?: number; reveal?: number }> = ({
  barPx = 132,
  reveal = 1,
}) => {
  const h = barPx * reveal;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: h, background: "#000" }} />
    </AbsoluteFill>
  );
};

// A soft dark scrim behind light-on-dark type so serif copy survives over the
// bright Veo motion. Positioned as a stretched radial glow.
export const TextScrim: React.FC<{
  cx?: string;
  cy?: string;
  rx?: string;
  ry?: string;
  strength?: number;
}> = ({ cx = "50%", cy = "50%", rx = "40%", ry = "26%", strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse ${rx} ${ry} at ${cx} ${cy}, rgba(0,0,0,${strength}) 0%, rgba(0,0,0,${strength * 0.6}) 45%, rgba(0,0,0,0) 75%)`,
    }}
  />
);

// Full-frame video fill for a 16:9 Veo clip inside the 16:9 canvas, with a very
// gentle "always breathing" push so no frame ever sits perfectly still.
export const breathe = (frame: number, duration: number, from = 1.03, to = 1.09) =>
  interpolate(frame, [0, duration], [from, to], { extrapolateRight: "clamp" });
