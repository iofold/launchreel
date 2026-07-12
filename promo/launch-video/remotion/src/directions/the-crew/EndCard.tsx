import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CREW, PRODUCT } from "../../lib/brand";
import { FONT_DISPLAY, FONT_MONO, FONT_SANS, INK, T } from "./theme";
import { Paper, Wordmark } from "./Primitives";
import { Bot } from "./Bot";

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - T.end.start;
  const mark = spring({ frame: local, fps, config: { damping: 15, stiffness: 140 }, durationInFrames: 18 });
  const tagOp = interpolate(local, [6, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaRise = spring({ frame: local - 10, fps, config: { damping: 16, stiffness: 150 }, durationInFrames: 16 });

  return (
    <Paper brackets>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0 }}>
        {/* wordmark */}
        <div style={{ transform: `translateY(${interpolate(mark, [0, 1], [-40, 0])}px) scale(${interpolate(mark, [0, 1], [0.9, 1])})`, opacity: mark }}>
          <Wordmark size={78} />
        </div>

        {/* five avatar chips, symmetric lineup */}
        <div style={{ marginTop: 46, display: "flex", gap: 30, alignItems: "flex-end" }}>
          {CREW.map((m, i) => {
            const pop = spring({ frame: local - (2 + i * 3), fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 12 });
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, transform: `scale(${pop}) translateY(${interpolate(pop, [0, 1], [24, 0])}px)`, opacity: pop }}>
                <div style={{ width: 128, height: 128, background: COLORS.paper, border: `4px solid ${INK}`, borderRadius: 22, boxShadow: `6px 6px 0 ${m.color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bot index={i} size={104} />
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 17, letterSpacing: 2, color: INK, textTransform: "uppercase" }}>{m.name}</div>
              </div>
            );
          })}
        </div>

        {/* tagline */}
        <div style={{ opacity: tagOp, marginTop: 44, fontFamily: FONT_DISPLAY, fontSize: 58, color: INK, letterSpacing: 0.5, textAlign: "center" }}>
          Five specialists. One job: your launch.
        </div>

        {/* CTA row */}
        <div style={{ transform: `translateY(${interpolate(ctaRise, [0, 1], [30, 0])}px)`, opacity: ctaRise, marginTop: 34, display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ background: COLORS.yellow, border: `5px solid ${INK}`, borderRadius: 16, padding: "16px 34px", fontFamily: FONT_DISPLAY, fontSize: 46, color: INK, boxShadow: `8px 8px 0 ${INK}` }}>
            {PRODUCT.url}
          </div>
          <div style={{ background: COLORS.paper, border: `4px solid ${INK}`, borderRadius: 14, padding: "12px 22px", fontFamily: FONT_MONO, fontWeight: 500, fontSize: 24, color: INK, boxShadow: `5px 5px 0 ${COLORS.pink}` }}>
            Launch Trailer · ₹999
          </div>
        </div>
        <div style={{ opacity: ctaRise, marginTop: 22, fontFamily: FONT_SANS, fontSize: 30, color: "#463b26" }}>
          Paste your URL → get a <span style={{ color: COLORS.pink, fontWeight: 700 }}>free teaser</span>.
        </div>
        <div style={{ opacity: tagOp, marginTop: 16, fontFamily: FONT_MONO, fontSize: 16, letterSpacing: 4, color: "#9a8f78" }}>
          BUILT AT THE GROWTHX × HERMES BUILDATHON
        </div>
      </AbsoluteFill>
    </Paper>
  );
};
