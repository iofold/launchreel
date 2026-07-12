import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { DeviceFrame } from "../components/DeviceFrame";
import { Callout } from "../components/Deco";
import { asset, parseMetric, formatNumber } from "../components/util";
import { readableOn } from "../theme";
import { DISPLAY, BODY } from "../fonts";
import { PlaceholderScreen } from "./TourA";

/**
 * Scene 4 — Product Tour B: feature callouts pinned inside the UI, then the camera
 * pushes hard onto ONE hero payoff metric (zoom-on-payoff). Deterministic Remotion.
 * Shares Tour A's top-anchored structure so the tall 9:16 frame never reads empty.
 */
export const TourB: React.FC<SceneProps> = ({ scene, theme, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const shot = asset(scene.screenshotPaths[0]);
  const hero = scene.metrics[0];
  const bg = theme.pop[4];
  const onBg = readableOn(bg, theme.ink, theme.paper);

  const s = spring({ frame, fps, config: { damping: 18, mass: 0.9 } });
  const x = interpolate(s, [0, 1], [-880, 0]);
  const rot = interpolate(s, [0, 1], [-5, 0]);

  const frameW = 940;
  const frameH = 600;

  const payoffStart = Math.max(0, durationInFrames - 44);
  const zoom = spring({ frame: frame - payoffStart, fps, config: { damping: 14 } });
  const kb = interpolate(frame, [8, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell bg={bg} ink={theme.ink}>
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
            The payoff
          </span>
          <div style={{ fontFamily: DISPLAY, fontSize: 84, color: onBg, letterSpacing: "-0.02em", lineHeight: 1.0 }}>
            {scene.headline || `Why ${brand.name}?`}
          </div>
        </div>

        {/* device with pinned callouts */}
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
              zoomFrom={1.05}
              zoomTo={1.26}
              focusX={60}
              focusY={52}
            />
          ) : (
            <PlaceholderScreen w={frameW} h={frameH} theme={theme} label={brand.name} />
          )}
          {/* top-left pinned callout, kept inside the frame */}
          <div style={{ position: "absolute", left: -24, top: 96 }}>
            <Callout
              text={scene.sub || "Built for speed"}
              fill={theme.pop[0]}
              textColor={readableOn(theme.pop[0], theme.ink, theme.paper)}
              ink={theme.ink}
              delayFrame={18}
              rotate={-4}
            />
          </div>
        </div>

        {/* hero payoff metric — zoom on payoff */}
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
                  padding: "40px 60px",
                  textAlign: "center",
                  boxShadow: `16px 16px 0 ${theme.pop[0]}`,
                }}
              >
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 168,
                    lineHeight: 1,
                    color: theme.pop[2],
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.03em",
                  }}
                >
                  <HeroValue value={hero.value} start={payoffStart} />
                </div>
                <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 38, color: theme.paper, marginTop: 10 }}>
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
