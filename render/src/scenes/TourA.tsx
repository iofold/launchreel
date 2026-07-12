import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { DeviceFrame } from "../components/DeviceFrame";
import { Callout } from "../components/Deco";
import { MetricCounter } from "../components/MetricCounter";
import { asset, popShadow } from "../components/util";
import { readableOn } from "../theme";
import { DISPLAY, BODY } from "../fonts";

/**
 * Scene 3 — Product Tour A: the REAL product screenshot slides into a browser
 * frame, then a slow ken-burns push toward a callout while metric tiles count up.
 * Deterministic Remotion (never gen-video) so the UI + numbers stay crisp.
 */
export const TourA: React.FC<SceneProps> = ({ scene, theme, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const shot = asset(scene.screenshotPaths[0]);
  const textColor = readableOn(theme.bg, theme.ink, theme.paper);

  // slide-in
  const s = spring({ frame, fps, config: { damping: 16, mass: 0.8 } });
  const x = interpolate(s, [0, 1], [900, 0]);
  const rot = interpolate(s, [0, 1], [6, 0]);
  // ken-burns over the scene
  const kb = interpolate(frame, [10, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const frameW = 940;
  const frameH = 600;

  return (
    <SceneShell bg={theme.bg} ink={theme.ink}>
      <AbsoluteFill style={{ padding: "70px 70px 60px", justifyContent: "flex-start", alignItems: "center" }}>
        {/* kicker + headline */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span
            style={{
              display: "inline-block",
              background: theme.ink,
              color: theme.pop[2],
              fontFamily: BODY,
              fontWeight: 900,
              fontSize: 24,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "7px 15px",
              borderRadius: 9,
              marginBottom: 22,
            }}
          >
            Take the tour
          </span>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 84,
              color: theme.ink,
              letterSpacing: "-0.02em",
              lineHeight: 1.0,
            }}
          >
            {scene.headline || `Meet ${brand.name}.`}
          </div>
        </div>

        {/* device */}
        <div style={{ transform: `translateX(${x}px) rotate(${rot}deg)`, position: "relative" }}>
          {shot ? (
            <DeviceFrame
              src={shot}
              url={brand.url}
              ink={theme.ink}
              accent={theme.accent}
              paper={theme.paper}
              width={frameW}
              height={frameH}
              t={kb}
              zoomFrom={1.02}
              zoomTo={1.16}
              focusX={40}
              focusY={42}
            >
              {scene.metrics[0] ? (
                <div style={{ position: "absolute", left: 26, bottom: 26 }}>
                  <Callout
                    text={scene.sub || scene.metrics[0].label}
                    fill={theme.pop[0]}
                    textColor={readableOn(theme.pop[0], theme.ink, theme.paper)}
                    ink={theme.ink}
                    delayFrame={22}
                  />
                </div>
              ) : null}
            </DeviceFrame>
          ) : (
            <PlaceholderScreen w={frameW} h={frameH} theme={theme} label={brand.name} />
          )}
        </div>

        {/* metric row */}
        <div style={{ display: "flex", gap: 24, marginTop: 46, flexWrap: "wrap", justifyContent: "center" }}>
          {scene.metrics.slice(0, 3).map((m, i) => (
            <MetricCounter
              key={i}
              label={m.label}
              value={m.value}
              fill={theme.pop[i % theme.pop.length]}
              textColor={readableOn(theme.pop[i % theme.pop.length], theme.ink, theme.paper)}
              ink={theme.ink}
              delay={18 + i * 6}
              size={54}
            />
          ))}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

export const PlaceholderScreen: React.FC<{ w: number; h: number; theme: SceneProps["theme"]; label: string }> = ({
  w,
  h,
  theme,
  label,
}) => (
  <div
    style={{
      width: w,
      height: h,
      background: theme.pop[3],
      border: `5px solid ${theme.ink}`,
      borderRadius: 26,
      boxShadow: popShadow(theme.ink, 12),
      display: "grid",
      placeItems: "center",
      fontFamily: DISPLAY,
      fontSize: 72,
      color: readableOn(theme.pop[3], theme.ink, theme.paper),
    }}
  >
    {label}
  </div>
);
