// SVG pointer with human-imperfect eased motion between waypoints, micro-jitter, and
// click ripples. Rendered inside the Intake sequence (local frames).
import React from "react";
import { useCurrentFrame, Easing } from "remotion";
import { noise2D } from "@remotion/noise";
import { COLORS } from "../../lib/brand";
import { CURSOR_PATH, CURSOR_CLICKS } from "./intakeShared";

const INK = COLORS.ink;
const easeMove = Easing.inOut(Easing.cubic);

function posAt(f: number) {
  const p = CURSOR_PATH;
  if (f <= p[0].f) return { x: p[0].x, y: p[0].y, moving: false };
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i];
    const b = p[i + 1];
    if (f >= a.f && f <= b.f) {
      const raw = (f - a.f) / (b.f - a.f);
      const t = easeMove(raw);
      const moving = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 4;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, moving };
    }
  }
  const last = p[p.length - 1];
  return { x: last.x, y: last.y, moving: false };
}

export const Cursor: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CURSOR_PATH[0].f) return null;
  const { x, y } = posAt(frame);
  // subtle hand tremor
  const jx = noise2D("cx", frame * 0.12, 0) * 2.2;
  const jy = noise2D("cy", frame * 0.12, 5) * 2.2;

  // click press squash: brief dip in scale right at each click
  let press = 1;
  for (const c of CURSOR_CLICKS) {
    const dt = frame - c.f;
    if (dt >= 0 && dt < 8) press = 1 - 0.18 * Math.exp(-dt / 2.5);
  }

  return (
    <>
      {/* ripples */}
      {CURSOR_CLICKS.map((c, i) => {
        const dt = frame - c.f;
        if (dt < 0 || dt > 20) return null;
        const r = 6 + dt * (c.soft ? 3.4 : 5.2);
        const op = Math.max(0, 1 - dt / 20);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: c.x - r,
              top: c.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: 999,
              border: `${c.soft ? 3 : 4}px solid ${c.soft ? COLORS.blue : COLORS.pink}`,
              opacity: op,
            }}
          />
        );
      })}
      {/* pointer */}
      <div
        style={{
          position: "absolute",
          left: x + jx,
          top: y + jy,
          transform: `scale(${press})`,
          transformOrigin: "top left",
          filter: `drop-shadow(2px 3px 0 ${INK})`,
        }}
      >
        <svg width="42" height="46" viewBox="0 0 42 46">
          <path
            d="M4 3 L4 38 L13 30 L19 43 L26 40 L20 27 L32 27 Z"
            fill="#fff"
            stroke={INK}
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
};
