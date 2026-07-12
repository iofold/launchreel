import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CHROME, COLORS, PRODUCT } from "../../../lib/brand";
import { FONT } from "../lib/type";

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// 24–30s · END-CARD (Remotion) — lands back on brand. No grain/vignette.
// Wordmark + tagline + launchreel.xyz + Free teaser → ₹999 + Buildathon credit.
export const EndCard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // fade up from the marquee's dark into the bright brand card ("house lights up")
  const bg = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pop = spring({ frame: frame - 8, fps, config: { damping: 13, mass: 0.7 } });
  const line = (d: number) =>
    interpolate(frame, [d, d + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: `rgb(${23 + (255 - 23) * bg},${19 + (243 - 19) * bg},${13 + (214 - 13) * bg})`,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: 104,
          color: COLORS.ink,
          transform: `scale(${0.7 + 0.3 * pop})`,
          opacity: pop,
          letterSpacing: "-0.02em",
        }}
      >
        <span>Launch</span>
        <span
          style={{
            background: COLORS.pink,
            color: COLORS.paper,
            border: CHROME.border,
            boxShadow: CHROME.shadow,
            borderRadius: CHROME.radius,
            padding: "0 22px 8px",
            lineHeight: 1.15,
          }}
        >
          Reel
        </span>
      </div>

      {/* tagline — the one elegant serif line that ties back to the film */}
      <div
        style={{
          marginTop: 42,
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 46,
          color: COLORS.ink,
          opacity: line(30),
          letterSpacing: "0.02em",
        }}
      >
        Every launch deserves an opening night.
      </div>

      {/* URL */}
      <div
        style={{
          marginTop: 40,
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: 54,
          color: COLORS.ink,
          opacity: line(46),
        }}
      >
        <span style={{ boxShadow: `inset 0 -14px 0 ${COLORS.yellow}` }}>{PRODUCT.url}</span>
      </div>

      {/* offer chip: free teaser anchored to ₹999 */}
      <div
        style={{
          marginTop: 34,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 30,
          color: COLORS.ink,
          background: COLORS.paper,
          border: CHROME.border,
          boxShadow: CHROME.shadowSm,
          borderRadius: 999,
          padding: "14px 30px",
          opacity: line(60),
          transform: `translateY(${interpolate(line(60), [0, 1], [14, 0])}px)`,
        }}
      >
        <span>Free teaser</span>
        <span style={{ opacity: 0.5 }}>→</span>
        <span
          style={{
            background: COLORS.yellow,
            borderRadius: 8,
            padding: "2px 12px",
            border: `2px solid ${COLORS.ink}`,
          }}
        >
          ₹999 full trailer
        </span>
      </div>

      {/* credit */}
      <div
        style={{
          position: "absolute",
          bottom: 54,
          fontFamily: FONT.body,
          fontSize: 24,
          letterSpacing: "0.08em",
          color: COLORS.ink,
          opacity: line(76) * 0.72,
        }}
      >
        Built at the GrowthX × Hermes Buildathon.
      </div>
    </AbsoluteFill>
  );
};
