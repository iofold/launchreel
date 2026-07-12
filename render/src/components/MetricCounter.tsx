import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { parseMetric, formatNumber, popShadow } from "./util";
import { DISPLAY, BODY } from "../fonts";

/**
 * A pop metric tile: big value that counts up from 0 to its target over the
 * scene, on a colored brutalist card. Non-numeric values render as-is.
 */
export const MetricCounter: React.FC<{
  label: string;
  value: string;
  fill: string;
  textColor: string;
  ink: string;
  delay?: number;
  countDuration?: number;
  size?: number;
}> = ({ label, value, fill, textColor, ink, delay = 0, countDuration = 26, size = 64 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { prefix, number, decimals, suffix } = parseMetric(value);

  const t = interpolate(frame - delay, [0, countDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const shown =
    number === null ? value : prefix + formatNumber(number * t, decimals) + suffix;

  // pop-in
  const appear = interpolate(frame - delay, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.6)),
  });

  return (
    <div
      style={{
        background: fill,
        border: `4px solid ${ink}`,
        borderRadius: 22,
        padding: "18px 24px",
        boxShadow: popShadow(ink, 8),
        transform: `scale(${appear}) rotate(${interpolate(appear, [0, 1], [-4, 0])}deg)`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 220,
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: size,
          lineHeight: 1,
          color: textColor,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {shown}
      </span>
      <span
        style={{
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 22,
          color: textColor,
          opacity: 0.9,
        }}
      >
        {label}
      </span>
    </div>
  );
};
