import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { COLORS, DISPLAY, GROTESK, MONO, PHASE, smooth } from "./theme";
import { PART_COUNT } from "./layers";

const S = PHASE.endcardStart;

const Wordmark: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10, transform: `scale(${scale})` }}>
    <div style={{ width: 46, height: 46, borderRadius: 12, background: COLORS.blue, border: `3px solid ${COLORS.ink}`, display: "grid", placeItems: "center" }}>
      <div style={{ width: 0, height: 0, borderTop: "9px solid transparent", borderBottom: "9px solid transparent", borderLeft: `15px solid #fff`, marginLeft: 3 }} />
    </div>
    <span style={{ fontFamily: DISPLAY, fontSize: 40, color: COLORS.ink, letterSpacing: -0.5 }}>Launch</span>
    <span style={{ fontFamily: DISPLAY, fontSize: 40, color: "#fff", background: COLORS.pink, border: `3px solid ${COLORS.ink}`, borderRadius: 12, padding: "0 12px", letterSpacing: -0.5 }}>Reel</span>
  </div>
);

// small tilted "your reel" sticker — product playing, loop-friendly
const MiniReel: React.FC = () => (
  <div style={{ position: "relative", width: 150, height: 266, borderRadius: 18, overflow: "hidden", border: `4px solid ${COLORS.ink}`, boxShadow: `9px 9px 0 ${COLORS.ink}`, background: `radial-gradient(120% 80% at 50% 20%, #4E74FF, ${COLORS.blue} 55%, #2246D8)` }}>
    <div style={{ position: "absolute", left: 10, top: 10, fontFamily: MONO, fontSize: 9, color: "#fff", background: COLORS.ink, padding: "2px 6px", borderRadius: 5 }}>▶ LIVE</div>
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "0 14px", textAlign: "center", fontFamily: DISPLAY, fontSize: 22, color: "#fff", lineHeight: 1.05 }}>Still doing books at midnight?</div>
    <div style={{ position: "absolute", left: "50%", top: "56%", transform: "translate(-50%,-50%)", width: 46, height: 46, borderRadius: "50%", background: COLORS.yellow, border: `3px solid ${COLORS.ink}`, display: "grid", placeItems: "center" }}>
      <div style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: `13px solid ${COLORS.ink}`, marginLeft: 3 }} />
    </div>
  </div>
);

export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wipe = smooth(f, [S - 2, S + 16], [0, 1]);
  if (wipe < 0.001) return null;

  const pop = (delay: number, damping = 13) => spring({ frame: f - (S + delay), fps, config: { damping, stiffness: 130, mass: 0.8 } });
  const head = pop(14);
  const sub = pop(30);
  const cta = pop(44);
  const price = pop(58);
  const mini = pop(20, 15);
  const badgeSpin = interpolate(f, [S, S + 60], [-14, -6], { extrapolateRight: "clamp" });
  // gentle idle so the long CTA hold breathes
  const idle = f - S;
  const bob = Math.sin(idle / 22) * 6;
  const starRot = -10 + Math.sin(idle / 26) * 10;

  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 ${(1 - wipe) * 100}% 0)` }}>
      <AbsoluteFill style={{ background: COLORS.cream }}>
        {/* faint pop grid + sticker shapes */}
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(23,19,13,0.05) 1.5px, transparent 1.5px)", backgroundSize: "34px 34px" }} />
        <div style={{ position: "absolute", right: 150, top: 120, fontSize: 60, transform: `rotate(${starRot}deg)`, opacity: mini }}>⭐</div>

        {/* 47 badge */}
        <div style={{ position: "absolute", left: 150, top: 120, transform: `rotate(${badgeSpin - 4}deg)`, opacity: mini, background: COLORS.yellow, border: `4px solid ${COLORS.ink}`, boxShadow: `6px 6px 0 ${COLORS.ink}`, borderRadius: 16, padding: "8px 18px", textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 44, color: COLORS.ink, lineHeight: 1 }}>{PART_COUNT}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.ink, letterSpacing: 1 }}>PARTS</div>
        </div>

        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 70, padding: "0 140px" }}>
          {/* copy column */}
          <div style={{ maxWidth: 900 }}>
            <div style={{ opacity: mini, transform: `translateY(${(1 - mini) * 20}px)` }}>
              <Wordmark />
            </div>
            <div style={{ marginTop: 26, opacity: head, transform: `translateY(${(1 - head) * 26}px)` }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 92, lineHeight: 0.98, color: COLORS.ink, letterSpacing: -2 }}>
                {PART_COUNT} moving parts.
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 92, lineHeight: 0.98, color: COLORS.blue, letterSpacing: -2 }}>
                You touch none.
              </div>
            </div>
            <div style={{ marginTop: 22, opacity: sub, fontFamily: GROTESK, fontWeight: 600, fontSize: 30, color: "#3a3223" }}>
              Paste a URL → a branded launch trailer, with voiceover, in minutes.
            </div>

            <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 22, opacity: cta, transform: `scale(${0.9 + cta * 0.1})`, transformOrigin: "left center" }}>
              <div style={{ background: COLORS.yellow, border: `4px solid ${COLORS.ink}`, boxShadow: `7px 7px 0 ${COLORS.ink}`, borderRadius: 14, padding: "14px 30px", fontFamily: DISPLAY, fontSize: 42, color: COLORS.ink }}>
                launchreel.xyz
              </div>
            </div>
            <div style={{ marginTop: 20, opacity: price, display: "flex", alignItems: "center", gap: 14, fontFamily: GROTESK, fontWeight: 700, fontSize: 24, color: COLORS.ink }}>
              <span style={{ background: COLORS.green, color: "#fff", border: `3px solid ${COLORS.ink}`, borderRadius: 10, padding: "4px 12px" }}>▶ Free 10-sec teaser</span>
              <span style={{ color: "#3a3223" }}>then <b>₹999</b> for the clean export</span>
            </div>
            <div style={{ marginTop: 22, opacity: price, fontFamily: MONO, fontSize: 15, letterSpacing: 1, color: "#8a8069" }}>
              BUILT AT THE GROWTHX × HERMES BUILDATHON
            </div>
          </div>

          {/* product sticker */}
          <div style={{ opacity: mini, transform: `translateY(${(1 - mini) * 40 + bob}px) rotate(4deg)` }}>
            <MiniReel />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
