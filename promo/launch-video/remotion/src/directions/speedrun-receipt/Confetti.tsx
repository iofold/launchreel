// Confetti burst for the PB moment — brand-colored chips launched from the top-right
// HUD, arcing out with gravity. Deterministic (no Math.random at render time).
import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../../lib/brand";

const PALETTE = [COLORS.yellow, COLORS.pink, COLORS.blue, COLORS.green, COLORS.purple, COLORS.orange];

const N = 90;
const rand = (i: number, s: number) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const Confetti: React.FC<{ startFrame: number; originX?: number; originY?: number }> = ({
  startFrame,
  originX = 1720,
  originY = 150,
}) => {
  const frame = useCurrentFrame();
  const t = frame - startFrame;
  if (t < 0 || t > 150) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {new Array(N).fill(0).map((_, i) => {
        const ang = Math.PI * (0.35 + 1.3 * rand(i, 1)); // spray leftward/down
        const speed = 10 + 22 * rand(i, 2);
        const vx = -Math.cos(ang) * speed;
        const vy = -Math.abs(Math.sin(ang)) * speed * 0.9;
        const g = 0.55;
        const x = originX + vx * t;
        const y = originY + vy * t + 0.5 * g * t * t;
        if (y > 1120) return null;
        const size = 10 + 14 * rand(i, 3);
        const rot = t * (6 + 14 * rand(i, 4)) * (rand(i, 5) > 0.5 ? 1 : -1);
        const life = Math.max(0, 1 - Math.max(0, t - 110) / 40);
        const isRect = rand(i, 6) > 0.4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: isRect ? size * 0.55 : size,
              background: PALETTE[i % PALETTE.length],
              border: `2px solid ${COLORS.ink}`,
              borderRadius: isRect ? 2 : 999,
              transform: `rotate(${rot}deg)`,
              opacity: life,
            }}
          />
        );
      })}
    </div>
  );
};
