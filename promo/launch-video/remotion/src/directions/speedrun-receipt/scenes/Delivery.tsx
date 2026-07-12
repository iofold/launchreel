// DELIVERY (20–24s) — "Your reel is ready" rebuilt from full-delivery.png. The trailer
// plays in a PiP frame; the global HUD stamps PB 00:47.21 with confetti; DING lands here.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../../../lib/brand";
import { UI } from "../fonts";
import { TopNav, Eyebrow, INK, card, Wordmark } from "../ui";

const pop = (frame: number, fps: number, delay: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } });

const PiPTrailer: React.FC = () => {
  const frame = useCurrentFrame();
  const prog = interpolate(frame, [0, 120], [0.06, 0.62], { extrapolateRight: "clamp" });
  const pulse = 1 + 0.06 * Math.sin(frame * 0.35);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 20 }}>
      <AbsoluteFill style={{ background: COLORS.blue }} />
      {/* drifting shapes */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 90 + Math.sin(frame * 0.05) * 14,
          width: 110,
          height: 110,
          borderRadius: 999,
          border: "5px solid rgba(255,255,255,0.55)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 44,
          bottom: 150 + Math.cos(frame * 0.06) * 16,
          width: 96,
          height: 96,
          border: "5px solid rgba(255,255,255,0.45)",
          transform: `rotate(${frame * 1.2}deg)`,
        }}
      />
      {/* play button */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          transform: `translate(-50%,-50%) scale(${pulse})`,
          width: 96,
          height: 96,
          borderRadius: 999,
          background: COLORS.yellow,
          border: `4px solid ${INK}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          color: INK,
        }}
      >
        ▶
      </div>
      {/* hook line */}
      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: "58%",
          textAlign: "center",
          color: "#fff",
          fontWeight: 900,
          fontSize: 34,
          lineHeight: 1.15,
          textShadow: `2px 2px 0 rgba(0,0,0,0.35)`,
        }}
      >
        Still doing books at midnight?
      </div>
      {/* scene chip + brand */}
      <div style={{ position: "absolute", left: 16, top: 16, background: INK, color: "#fff", fontWeight: 800, fontSize: 15, padding: "5px 10px", borderRadius: 8 }}>
        SCENE 1 · HOOK
      </div>
      <div style={{ position: "absolute", right: 16, top: 16, color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>LEDGERLY</div>
      {/* scrubber */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ color: "#fff", fontSize: 15 }}>▶</div>
        <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.3)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${prog * 100}%`, height: "100%", background: "#fff" }} />
        </div>
        <div style={{ color: "#fff", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
          0:{String(Math.floor(prog * 30)).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
};

export const Delivery: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const RX = 560; // right column x

  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: UI }}>
      <TopNav active="Delivery" />

      <div style={{ position: "absolute", left: 72, top: 100 }}>
        <Eyebrow>DELIVERED</Eyebrow>
      </div>
      <div style={{ position: "absolute", left: 72, top: 138, fontWeight: 900, fontSize: 54, color: INK }}>
        Your reel is ready 🎉
      </div>
      <div style={{ position: "absolute", left: 72, top: 210, fontWeight: 700, fontSize: 22, color: INK, opacity: 0.8 }}>
        Ledgerly · 30-sec vertical launch trailer · 1080×1920
      </div>

      {/* PiP phone frame */}
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 280,
          width: 404,
          height: 718,
          transform: `scale(${pop(frame, fps, 2)})`,
          transformOrigin: "top left",
          ...card({ borderRadius: 26, background: COLORS.blue, boxShadow: `8px 8px 0 ${INK}` }),
        }}
      >
        <PiPTrailer />
      </div>

      {/* right column */}
      <div style={{ position: "absolute", left: RX, top: 292, display: "flex", gap: 16, transform: `scale(${pop(frame, fps, 6)})`, transformOrigin: "left top" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: INK, color: "#fff", fontWeight: 900, fontSize: 24, padding: "14px 26px", borderRadius: 14, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${COLORS.ink}` }}>
          ⬇ Download MP4
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS.pink, color: "#fff", fontWeight: 900, fontSize: 24, padding: "14px 26px", borderRadius: 14, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
          𝕏 Share to X
        </div>
      </div>

      <div style={{ position: "absolute", left: RX, top: 372, opacity: pop(frame, fps, 10) }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: INK, marginBottom: 8 }}>Prefilled post</div>
        <div style={{ width: 1216, ...card({ background: COLORS.sky, borderRadius: 14, boxShadow: "none" }), padding: "18px 22px", boxSizing: "border-box", fontSize: 21, fontWeight: 600, color: INK, lineHeight: 1.35 }}>
          We just launched Ledgerly 🚀 Bookkeeping on autopilot for founders. Watch our 30-sec launch trailer 👇 Made in minutes with @LaunchReel · #BuildathonTV
          <div style={{ marginTop: 6, fontWeight: 800 }}>▶ launchreel.xyz/p/ledgerly</div>
        </div>
      </div>

      {/* upsell card */}
      <div style={{ position: "absolute", left: RX, top: 560, width: 1216, transform: `scale(${pop(frame, fps, 14)})`, transformOrigin: "left top", ...card({ background: COLORS.pink, borderRadius: 18 }), padding: "22px 26px", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 900, fontSize: 26, color: "#fff", marginBottom: 6 }}>✨ Love it? Level up</div>
        <div style={{ fontWeight: 700, fontSize: 21, color: "#fff", lineHeight: 1.3, marginBottom: 18 }}>
          Remove the watermark and get the full Content Pack — 3 social posts, OG images, and hero copy to match.
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ background: COLORS.yellow, color: INK, fontWeight: 900, fontSize: 22, padding: "12px 24px", borderRadius: 12, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
            Upgrade to ₹2,999 Pack
          </div>
          <div style={{ background: COLORS.paper, color: INK, fontWeight: 900, fontSize: 22, padding: "12px 24px", borderRadius: 12, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
            Remove watermark · ₹999
          </div>
        </div>
      </div>

      {/* buildathon tv */}
      <div style={{ position: "absolute", left: RX, top: 760, display: "flex", alignItems: "center", gap: 10, transform: `scale(${pop(frame, fps, 18)})`, transformOrigin: "left top", background: COLORS.green, color: INK, fontWeight: 900, fontSize: 23, padding: "13px 26px", borderRadius: 14, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}` }}>
        📺 Put it on Buildathon TV
      </div>
    </AbsoluteFill>
  );
};
