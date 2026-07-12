// CRT / broadcast texture primitives: scanlines, vignette, grain, TV static,
// the channel-zap flash, and a chromatic RGB-split wrapper.
import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

// Horizontal CRT scanlines. Kept subtle so body text stays clean.
export const Scanlines: React.FC<{ opacity?: number; gap?: number }> = ({
  opacity = 0.22,
  gap = 3,
}) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${opacity}) 0px, rgba(0,0,0,${opacity}) 1px, transparent 1px, transparent ${gap}px)`,
      mixBlendMode: "multiply",
    }}
  />
);

// Rolling brightness bar that drifts down the screen like a de-synced CRT.
export const RollBar: React.FC<{ speed?: number; strength?: number }> = ({
  speed = 2.2,
  strength = 0.12,
}) => {
  const frame = useCurrentFrame();
  const y = ((frame * speed) % 140) - 20;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${y}%`,
          height: "18%",
          background: `linear-gradient(180deg, transparent, rgba(255,255,255,${strength}), transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

// Barrel-ish vignette to seat everything inside a tube.
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
      boxShadow: `inset 0 0 220px rgba(0,0,0,${strength * 0.9})`,
    }}
  />
);

let GRAIN_SEQ = 0;
// Animated fractal-noise grain (VHS / film dirt). Cheap and crisp.
export const Grain: React.FC<{ opacity?: number; freq?: number }> = ({
  opacity = 0.18,
  freq = 0.75,
}) => {
  const frame = useCurrentFrame();
  const id = React.useMemo(() => `grain-${GRAIN_SEQ++}`, []);
  const seed = (frame * 7) % 211;
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity, mixBlendMode: "overlay" }}
      preserveAspectRatio="none"
    >
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={seed} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
};

let STATIC_SEQ = 0;
// Full TV static. `mono` = classic B/W snow; otherwise colored sparkle.
export const Static: React.FC<{ opacity?: number; mono?: boolean; freq?: number }> = ({
  opacity = 1,
  mono = true,
  freq = 0.9,
}) => {
  const frame = useCurrentFrame();
  const id = React.useMemo(() => `static-${STATIC_SEQ++}`, []);
  const seed = (frame * 13) % 331;
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity }}
      preserveAspectRatio="none"
    >
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={3} seed={seed} stitchTiles="stitch" />
        {mono ? <feColorMatrix type="saturate" values="0" /> : null}
        <feComponentTransfer>
          <feFuncA type="linear" slope={1.5} intercept={-0.15} />
        </feComponentTransfer>
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
};

// A short violent zap: full static + white slam + horizontal tear, centred on
// `at`. Renders nothing outside its window. Place at each channel change.
export const ZapFlash: React.FC<{ localCenter: number; width?: number }> = ({
  localCenter,
  width = 6,
}) => {
  const frame = useCurrentFrame();
  const d = Math.abs(frame - localCenter);
  if (d > width) return null;
  const k = 1 - d / width; // 0..1 intensity
  const white = interpolate(d, [0, 1.2], [0.9, 0], { extrapolateRight: "clamp" });
  const tear = (random(`t${Math.floor(frame)}`) - 0.5) * 60 * k;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${tear}px)` }}>
        <Static opacity={0.55 + 0.45 * k} mono />
      </div>
      <AbsoluteFill style={{ background: "#FFFDF4", opacity: white }} />
    </AbsoluteFill>
  );
};

// Chromatic aberration: duplicate children shifted in red/cyan. Use sparingly.
export const RgbSplit: React.FC<{ amount: number; children: React.ReactNode }> = ({
  amount,
  children,
}) => {
  if (amount < 0.2) return <>{children}</>;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${-amount}px)`, mixBlendMode: "screen", filter: "url(#cz-red)" }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${amount}px)`, mixBlendMode: "screen", filter: "url(#cz-blue)" }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// SVG color-matrix filters used by RgbSplit. Mount once near the root.
export const RgbSplitDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <filter id="cz-red">
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
      </filter>
      <filter id="cz-blue">
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
      </filter>
    </defs>
  </svg>
);
