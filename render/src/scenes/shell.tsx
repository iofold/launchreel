import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate, Easing } from "remotion";
import type { Scene, Storyboard } from "../schema";
import type { Theme } from "../theme";
import { asset } from "../components/util";

export interface SceneProps {
  scene: Scene;
  theme: Theme;
  brand: Storyboard["brand"];
  index: number;
  watermark: boolean;
}

/**
 * Common scene wrapper: fills the frame with a background, optionally lays a muted
 * Veo b-roll clip UNDER the content (Hook / CTA), and applies a snappy pop
 * entrance so hard cuts still feel kinetic.
 */
export const SceneShell: React.FC<{
  bg: string;
  ink: string;
  bgVideoPath?: string;
  entrance?: boolean;
  children: React.ReactNode;
}> = ({ bg, ink, bgVideoPath, entrance = true, children }) => {
  const frame = useCurrentFrame();
  const vid = asset(bgVideoPath);
  const p = entrance
    ? interpolate(frame, [0, 9], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 1;
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      {vid ? (
        <AbsoluteFill>
          <OffthreadVideo src={vid} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <AbsoluteFill style={{ background: bg, opacity: 0.28 }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill
        style={{
          opacity: p,
          transform: `scale(${interpolate(p, [0, 1], [0.985, 1])})`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Progress bar burned into the bottom edge — reads as a "trailer" timeline. */
export const ProgressStripe: React.FC<{ t: number; ink: string; accent: string }> = ({
  t,
  ink,
  accent,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 12,
      background: "rgba(0,0,0,0.14)",
    }}
  >
    <div style={{ height: "100%", width: `${t * 100}%`, background: accent, borderRight: `3px solid ${ink}` }} />
  </div>
);
