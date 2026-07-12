import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../lib/brand";
import { FONT_DISPLAY, FONT_MONO, FONT_SANS, INK, T } from "./theme";
import { Paper, Stamp } from "./Primitives";

export const Delivery: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - T.delivery.start;
  const head = spring({ frame: local, fps, config: { damping: 14, stiffness: 140 }, durationInFrames: 24 });
  const thumb = spring({ frame: local - 8, fps, config: { damping: 13, stiffness: 150 }, durationInFrames: 24 });
  const playPulse = 1 + 0.04 * Math.sin(frame * 0.25);

  return (
    <Paper brackets>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* DELIVERED pill */}
        <div style={{ transform: `translateY(${interpolate(head, [0, 1], [-30, 0])}px)`, opacity: head, background: COLORS.yellow, border: `4px solid ${INK}`, borderRadius: 10, padding: "8px 22px", fontFamily: FONT_MONO, fontWeight: 500, letterSpacing: 6, fontSize: 22, color: INK, boxShadow: `5px 5px 0 ${INK}` }}>
          DELIVERED
        </div>
        {/* heading */}
        <div style={{ transform: `translateY(${interpolate(head, [0, 1], [26, 0])}px)`, opacity: head, marginTop: 24, fontFamily: FONT_DISPLAY, fontSize: 108, color: INK, letterSpacing: -1 }}>
          Your reel is ready 🎉
        </div>
        <div style={{ opacity: head, marginTop: 12, fontFamily: FONT_MONO, fontSize: 26, letterSpacing: 3, color: "#5b5343" }}>
          Ledgerly · 30-sec launch trailer · 1080×1920
        </div>

        {/* trailer thumbnail */}
        <div style={{ marginTop: 44, position: "relative", transform: `scale(${thumb})`, opacity: thumb }}>
          <div style={{ width: 340, height: 216, background: COLORS.blue, border: `5px solid ${INK}`, borderRadius: 16, boxShadow: `10px 10px 0 ${INK}`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 14, left: 16, fontFamily: FONT_MONO, fontSize: 15, letterSpacing: 2, color: "#fff", background: "#0000003a", padding: "4px 8px", borderRadius: 6 }}>SCENE 1 · HOOK</div>
            <div style={{ position: "absolute", top: 14, right: 16, fontFamily: FONT_MONO, fontSize: 15, letterSpacing: 2, color: "#CDE7FF" }}>LEDGERLY</div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ transform: `scale(${playPulse})`, width: 78, height: 78, borderRadius: "50%", background: COLORS.yellow, border: `5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 0, height: 0, borderTop: "18px solid transparent", borderBottom: "18px solid transparent", borderLeft: `28px solid ${INK}`, marginLeft: 6 }} />
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 16, left: 20, right: 20, fontFamily: FONT_DISPLAY, fontSize: 26, color: "#fff", opacity: 0.85 }}>Still doing books at midnight?</div>
          </div>
        </div>

        {/* stamp slams over */}
        <Stamp label="DELIVERED — 4 MIN 47 SEC" appearAt={T.delivery.start + 44} x={1160} y={648} rotate={-9} color={COLORS.green} scale={1} />
      </AbsoluteFill>
    </Paper>
  );
};
