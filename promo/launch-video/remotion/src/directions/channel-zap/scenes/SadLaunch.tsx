// CH 01 (96–262f) — THE SAD LAUNCH. Desaturated 4:3 dead channel, a lonely
// tweet flickering, likes crawling to 14. Lower-third BREAKING ticker.
import React from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { COLORS, CHROME } from "../../../lib/brand";
import { ANTON, INTER } from "../theme";
import { Scanlines, Grain, RollBar, Static } from "../Crt";
import { ChannelBug, Ticker } from "../chrome";

const DEAD = "#15171c";

export const SadLaunch: React.FC = () => {
  const frame = useCurrentFrame();

  // reception flicker + occasional dropout
  const flick = 0.82 + 0.18 * random(`f${Math.floor(frame / 2)}`);
  const dropout = random(`d${Math.floor(frame / 5)}`) > 0.94 ? 0.35 : 1;

  // likes climb fast then stall at 14 (sync to "…gets fourteen likes?")
  const likesF = interpolate(frame, [30, 70, 150], [0, 11, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const likes = Math.round(likesF);

  const cardIn = interpolate(frame, [6, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {/* 4:3 pillarbox */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ position: "relative", width: 1440, height: 1080, overflow: "hidden", background: DEAD }}>
          {/* faint dead-channel wash */}
          <AbsoluteFill style={{ background: "radial-gradient(80% 70% at 50% 42%, #23262d 0%, transparent 60%)" }} />
          <Static opacity={0.06} mono />

          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              filter: "grayscale(0.88) contrast(0.92) brightness(0.86)",
              opacity: flick * dropout,
            }}
          >
            <div
              style={{
                width: 760,
                background: "#e9e6df",
                border: CHROME.border,
                borderRadius: 20,
                boxShadow: "10px 10px 0 rgba(0,0,0,0.55)",
                padding: "30px 34px",
                transform: `translateY(${(1 - cardIn) * 24}px)`,
                opacity: cardIn,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 66, height: 66, borderRadius: 999, background: "#b9b4aa", border: CHROME.border }} />
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 30, color: COLORS.ink }}>Your Startup</div>
                  <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 24, color: "#6b6b6b" }}>@yourstartup · launch day</div>
                </div>
              </div>
              <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 52, color: COLORS.ink, margin: "22px 0 8px" }}>
                we&rsquo;re live 🚀
              </div>
              <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 24, color: "#6b6b6b", marginBottom: 22 }}>
                11:11 PM · six months of work
              </div>
              <div style={{ display: "flex", gap: 46, fontFamily: INTER, fontWeight: 800, fontSize: 30, color: "#4a4a4a" }}>
                <span style={{ color: likes >= 14 ? "#8a8a8a" : COLORS.ink }}>♡ {likes}</span>
                <span>↻ 1</span>
                <span>💬 0</span>
              </div>
            </div>

            <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 30, color: "#5a5a5a", marginTop: 40, letterSpacing: 6 }}>
              · · · crickets · · ·
            </div>
          </AbsoluteFill>

          <Scanlines opacity={0.34} gap={4} />
          <Grain opacity={0.22} />
          <RollBar speed={1.4} strength={0.16} />
        </div>
      </AbsoluteFill>

      <ChannelBug n="01" tint="#c9c4ba" />
      <div style={{ position: "absolute", top: 46, left: 56, fontFamily: ANTON, fontSize: 34, color: "#8a8a8a", letterSpacing: 3 }}>
        ▂ WEAK SIGNAL
      </div>

      <Ticker
        tag="BREAKING"
        tagColor={COLORS.pink}
        items={["six months of work", "one screenshot", "fourteen likes", "nobody noticed", "the launch that never launched"]}
        speed={5}
      />
    </AbsoluteFill>
  );
};
