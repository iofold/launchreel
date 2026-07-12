import React from "react";
import { interpolate } from "remotion";
import { EASE } from "../../lib/brand";
import { FONT } from "./lib/type";

// A single line of elegant cinematic type with a slow rise-and-settle reveal
// and an optional fade-out. `frame` is scene-local.
export const CineLine: React.FC<{
  frame: number;
  start: number;
  outStart?: number; // frame at which it begins to fade away
  rise?: number; // px it rises while appearing
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ frame, start, outStart, rise = 14, style, children }) => {
  // Clamp progress manually so a scene-local frame of 0 can never leak a
  // nonzero reveal (interpolate + custom easing mis-handled out-of-range input).
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const inP = interpolateEase(clamp01((frame - start) / 22));
  const outP = outStart ? 1 - clamp01((frame - outStart) / 16) : 1;
  // fold any caller-supplied base opacity into the reveal so `style` can't clobber it
  const { opacity: baseOpacity = 1, ...restStyle } = style ?? {};
  const opacity = inP * outP * (baseOpacity as number);
  const y = interpolate(inP, [0, 1], [rise, 0]);
  // tracking eases from slightly open to settled — a filmic title touch
  const tracking = interpolate(inP, [0, 1], [0.22, 0.06], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: FONT.serif,
        opacity,
        transform: `translateY(${y}px)`,
        letterSpacing: `${tracking}em`,
        ...restStyle,
      }}
    >
      {children}
    </div>
  );
};

// Cubic-bezier EASE from brand.ts, evaluated as an easing fn for interpolate.
// (Remotion's interpolate easing takes t->t; approximate the house curve.)
export const interpolateEase = (t: number) => {
  // ease-out expo-ish, matches the [0.16,1,0.3,1] feel closely enough for type
  return 1 - Math.pow(1 - t, 3);
};

export { EASE };
