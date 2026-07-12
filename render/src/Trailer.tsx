import React from "react";
import { AbsoluteFill, Audio, Series, useVideoConfig, useCurrentFrame } from "remotion";
import type { Storyboard, Scene, SceneType } from "./schema";
import { FPS } from "./schema";
import { makeTheme } from "./theme";
import { useLoadFonts, DISPLAY } from "./fonts";
import { asset } from "./components/util";
import { ProgressStripe } from "./scenes/shell";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { TourA } from "./scenes/TourA";
import { TourB } from "./scenes/TourB";
import { SocialProof } from "./scenes/SocialProof";
import { CTA } from "./scenes/CTA";
import type { SceneProps } from "./scenes/shell";

const SCENE_COMPONENTS: Record<SceneType, React.FC<SceneProps>> = {
  hook: Hook,
  problem: Problem,
  tour_a: TourA,
  tour_b: TourB,
  social_proof: SocialProof,
  cta: CTA,
};

export const durationFramesForScene = (s: Scene): number => Math.max(1, Math.round(s.durationSec * FPS));

export const totalDurationInFrames = (sb: Storyboard): number =>
  sb.scenes.reduce((acc, s) => acc + durationFramesForScene(s), 0);

export const Trailer: React.FC<Storyboard> = (sb) => {
  useLoadFonts();
  const theme = makeTheme(sb.brand.colors);
  const { durationInFrames } = useVideoConfig();
  const vo = asset(sb.audio?.voPath);
  const music = asset(sb.audio?.musicPath);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Series>
        {sb.scenes.map((scene, i) => {
          const Comp = SCENE_COMPONENTS[scene.type] ?? Hook;
          return (
            <Series.Sequence key={i} durationInFrames={durationFramesForScene(scene)}>
              <Comp scene={scene} theme={theme} brand={sb.brand} index={i} watermark={sb.watermark} />
            </Series.Sequence>
          );
        })}
      </Series>

      {/* audio (optional) */}
      {vo ? <Audio src={vo} /> : null}
      {music ? <Audio src={music} volume={vo ? 0.22 : 0.55} /> : null}

      {/* global progress + persistent free-tier watermark */}
      <GlobalOverlay theme={theme} watermark={sb.watermark} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};

const GlobalOverlay: React.FC<{ theme: ReturnType<typeof makeTheme>; watermark: boolean; durationInFrames: number }> = ({
  theme,
  watermark,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  return (
    <>
      <ProgressStripe t={frame / durationInFrames} ink={theme.ink} accent={theme.accent} />
      {watermark ? (
        <div
          style={{
            position: "absolute",
            bottom: 30,
            right: 30,
            fontFamily: DISPLAY,
            fontSize: 22,
            color: theme.ink,
            background: theme.paper,
            border: `3px solid ${theme.ink}`,
            borderRadius: 10,
            padding: "6px 12px",
            opacity: 0.9,
            boxShadow: `3px 3px 0 ${theme.ink}`,
          }}
        >
          made with LaunchReel
        </div>
      ) : null}
    </>
  );
};
