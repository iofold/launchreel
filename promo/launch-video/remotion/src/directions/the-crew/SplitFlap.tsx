import React from "react";
import { interpolate } from "remotion";
import { COLORS } from "../../lib/brand";
import { FONT_MONO, INK } from "./theme";

// A single split-flap tile. Flips on the X axis: old glyph collapses (0->-90),
// new glyph swings up (90->0). `flip` is 0..1 progress of the current change.
const Flap: React.FC<{ ch: string; prev: string; flip: number; size: number }> = ({
  ch,
  prev,
  flip,
  size,
}) => {
  const w = size * 0.66;
  const h = size;
  const seam = (
    <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "rgba(0,0,0,0.55)", zIndex: 5, transform: "translateY(-1px)" }} />
  );
  const glyph = (c: string, deg: number, dim: number) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_MONO,
        fontWeight: 500,
        fontSize: size * 0.62,
        color: COLORS.cream,
        background: "#221C13",
        borderRadius: 6,
        transform: `rotateX(${deg}deg)`,
        backfaceVisibility: "hidden",
        filter: `brightness(${dim})`,
      }}
    >
      {c}
    </div>
  );
  // First half of the flip shows the old glyph tilting away; second half the new.
  const showingOld = flip < 0.5;
  const deg = showingOld ? interpolate(flip, [0, 0.5], [0, -90]) : interpolate(flip, [0.5, 1], [90, 0]);
  const dim = showingOld ? interpolate(flip, [0, 0.5], [1, 0.5]) : interpolate(flip, [0.5, 1], [0.5, 1]);
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        margin: `0 ${size * 0.05}px`,
        perspective: 300,
        boxShadow: `3px 3px 0 ${INK}`,
        border: `3px solid ${INK}`,
        borderRadius: 8,
        background: "#221C13",
      }}
    >
      {glyph(flip > 0 ? (showingOld ? prev : ch) : ch, flip > 0 ? deg : 0, flip > 0 ? dim : 1)}
      {seam}
    </div>
  );
};

// Split-flap board. `text` is the current string; `prevText` the last tick's
// string; `flip` the shared 0..1 flip progress this tick. Non-digit chars
// (":", "–", " ") render as fixed separators.
export const SplitFlap: React.FC<{
  text: string;
  prevText: string;
  flip: number;
  size?: number;
}> = ({ text, prevText, flip, size = 96 }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {text.split("").map((c, i) => {
        const prev = prevText[i] ?? c;
        if (c === ":" || c === " " || c === "–" || c === "-") {
          return (
            <div
              key={i}
              style={{
                fontFamily: FONT_MONO,
                fontWeight: 500,
                fontSize: size * 0.62,
                color: INK,
                width: c === " " ? size * 0.22 : size * 0.4,
                textAlign: "center",
              }}
            >
              {c === " " ? "" : c}
            </div>
          );
        }
        return <Flap key={i} ch={c} prev={prev} flip={c === prev ? 0 : flip} size={size} />;
      })}
    </div>
  );
};

// Helper: format a mm:ss countdown from a fractional seconds value.
export const mmss = (totalSec: number) => {
  const t = Math.max(0, totalSec);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
