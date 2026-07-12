import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { DeviceFrame } from "../components/DeviceFrame";
import { Callout } from "../components/Deco";
import { MetricCounter } from "../components/MetricCounter";
import { asset, parseMetric, formatNumber } from "../components/util";
import { readableOn } from "../theme";
import { DISPLAY, BODY } from "../fonts";
import { PlaceholderScreen } from "./TourA";

/**
 * Scene 4 — Product Tour B: feature callouts animate in beside the UI, then the
 * camera pushes hard onto ONE hero payoff metric (zoom-on-payoff). Deterministic.
 */
export const TourB: React.FC<SceneProps> = ({ scene, theme, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const shot = asset(scene.screenshotPaths[0]);
  const hero = scene.metrics[0];

  const s = spring({ frame, fps, config: { damping: 18, mass: 0.9 } });
  const y = interpolate(s, [0, 1], [700, 0]);

  const frameW = 960;
  const frameH = 610;

  // hero-metric zoom-on-payoff near the end
  const payoffStart = Math.max(0, durationInFrames - 46);
  const zoom = spring({ frame: frame - payoffStart, fps, config: { damping: 14 } });
  const kb = interpolate(frame, [8, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const callouts = [
    { t: scene.headline || "Built for speed", x: -40, yPos: 40, rot: -4, delay: 16, fill: theme.pop[0] },
    { t: scene.sub || "Zero setup", x: frameW - 220, yPos: frameH - 120, rot: 4, delay: 26, fill: theme.pop[2] },
  ];

  return (
    <SceneShell bg={theme.pop[4]} ink={theme.ink}>
      <AbsoluteFill style={{ padding: "80px 60px", justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `translateY(${y}px)`, position: "relative" }}>
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
              zoomFrom={1.05}
              zoomTo={1.28}
              focusX={62}
              focusY={55}
            />
          ) : (
            <PlaceholderScreen w={frameW} h={frameH} theme={theme} label={brand.name} />
          )}
          {/* callouts */}
          {callouts.map((c, i) => (
            <div key={i} style={{ position: "absolute", left: c.x, top: c.yPos }}>
              <Callout
                text={c.t}
                fill={c.fill}
                textColor={readableOn(c.fill, theme.ink, theme.paper)}
                ink={theme.ink}
                delayFrame={c.delay}
                rotate={c.rot}
              />
            </div>
          ))}
        </div>

        {/* hero payoff metric */}
        {hero ? (
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              pointerEvents: "none",
              opacity: interpolate(frame - payoffStart, [0, 8], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ transform: `scale(${interpolate(zoom, [0, 1], [0.6, 1])})` }}>
              <div
                style={{
                  background: theme.ink,
                  border: `6px solid ${theme.paper}`,
                  borderRadius: 28,
                  padding: "34px 52px",
                  textAlign: "center",
                  boxShadow: `14px 14px 0 ${theme.pop[0]}`,
                }}
              >
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 150,
                    lineHeight: 1,
                    color: theme.pop[2],
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.03em",
                  }}
                >
                  <HeroValue value={hero.value} start={payoffStart} />
                </div>
                <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 34, color: theme.paper, marginTop: 8 }}>
                  {hero.label}
                </div>
              </div>
            </div>
          </AbsoluteFill>
        ) : null}
      </AbsoluteFill>
    </SceneShell>
  );
};

const HeroValue: React.FC<{ value: string; start: number }> = ({ value, start }) => {
  const frame = useCurrentFrame();
  const { prefix, number, decimals, suffix } = parseMetric(value);
  if (number === null) return <>{value}</>;
  const t = interpolate(frame - start, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return <>{prefix + formatNumber(number * t, decimals) + suffix}</>;
};
