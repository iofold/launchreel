// SIGN-OFF (702–900f) — tube powers back on, blooms into the LaunchReel
// end-card inside a TV frame. CTA + free-teaser + ₹999 anchor. Loop-friendly.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CHROME, PRODUCT } from "../../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "../theme";
import { Scanlines, Grain } from "../Crt";
import { OnAir, Wordmark } from "../chrome";

export const SignOff: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // power-on bloom: a bright line snaps wide, then the picture opens vertically.
  const lineW = interpolate(frame, [2, 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const openY = interpolate(frame, [7, 18], [0.015, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = interpolate(frame, [6, 13], [0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const content = interpolate(frame, [16, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const urlPop = spring({ frame: frame - 30, fps, config: { damping: 12 }, durationInFrames: 16 });

  return (
    <AbsoluteFill style={{ background: "#000", justifyContent: "center", alignItems: "center" }}>
      {/* the pre-bloom scan line */}
      {frame < 9 ? (
        <div style={{ width: `${lineW * 90}%`, height: 6, background: COLORS.paper, boxShadow: `0 0 40px ${COLORS.paper}` }} />
      ) : null}

      {/* picture opens vertically inside the tube */}
      <AbsoluteFill style={{ transform: `scaleY(${openY})`, transformOrigin: "center" }}>
        <AbsoluteFill style={{ background: COLORS.cream, padding: 40 }}>
          {/* TV bezel */}
          <div style={{ position: "relative", flex: 1, borderRadius: 34, background: COLORS.cream, border: `14px solid #26262b`, boxShadow: `inset 0 0 100px rgba(0,0,0,0.28)`, overflow: "hidden" }}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: content, gap: 30 }}>
              <div style={{ transform: "translateY(-6px)" }}>
                <Wordmark size={110} />
              </div>

              <div style={{ fontFamily: ANTON, fontSize: 92, color: COLORS.ink, letterSpacing: 1, textAlign: "center", lineHeight: 0.98 }}>
                EVERY LAUNCH
                <br />
                DESERVES PRIMETIME
              </div>

              {/* URL chip */}
              <div
                style={{
                  transform: `scale(${interpolate(urlPop, [0, 1], [0.7, 1])})`,
                  padding: "18px 46px",
                  background: COLORS.ink,
                  borderRadius: 999,
                  boxShadow: `7px 7px 0 ${COLORS.pink}`,
                  fontFamily: ARCHIVO,
                  fontSize: 58,
                  color: COLORS.yellow,
                  letterSpacing: 1,
                }}
              >
                {PRODUCT.url}
              </div>

              <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 40, color: COLORS.ink }}>
                Paste your URL → <span style={{ color: COLORS.pink }}>free teaser</span>
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                <span style={{ padding: "10px 22px", background: COLORS.paper, border: CHROME.border, borderRadius: 999, boxShadow: CHROME.shadowSm, fontFamily: INTER, fontWeight: 800, fontSize: 26, color: COLORS.ink }}>
                  Free watermarked teaser
                </span>
                <span style={{ padding: "10px 22px", background: COLORS.yellow, border: CHROME.border, borderRadius: 999, boxShadow: CHROME.shadowSm, fontFamily: INTER, fontWeight: 900, fontSize: 26, color: COLORS.ink }}>
                  ₹999 full trailer
                </span>
              </div>

              <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 24, color: "#6a655a", marginTop: 6 }}>
                Built at the GrowthX × Hermes Buildathon
              </div>
            </AbsoluteFill>

            <div style={{ position: "absolute", top: 26, right: 30, opacity: content }}>
              <OnAir scale={1.1} />
            </div>

            <Scanlines opacity={0.14} gap={4} />
            <Grain opacity={0.08} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* bloom flash */}
      <AbsoluteFill style={{ background: COLORS.paper, opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
