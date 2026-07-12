import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { noise2D } from "@remotion/noise";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadDisplay } from "@remotion/google-fonts/ArchivoBlack";
import { COLORS, CHROME, CREW, PRODUCT } from "../../lib/brand";
import { qrMatrix } from "./qr";

// ── Fonts ────────────────────────────────────────────────────────────────────
// Dark half = confessional terminal mono. Pop half = chunky grotesque shout.
// Constrain to the weights/subset actually used so renders don't hammer the CDN.
const MONO = loadMono("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
}).fontFamily;
const DISPLAY = loadDisplay("normal", {
  weights: ["400"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
}).fontFamily;

// ── Timeline (frames @ 30fps, 900 total) ─────────────────────────────────────
// Dark half rides a 60bpm heartbeat → 30 frames / beat. Every landing sits on a
// beat. The FLIP is beat 11 (frame 330). Pop half rides 120bpm → 15 frames / beat.
const FLIP = 330;

// ── Small helpers ─────────────────────────────────────────────────────────────
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Seeded 2–3px screen shake that decays over ~5 frames after a landing.
const shakeAt = (frame: number, land: number, amp = 2.5, dur = 6) => {
  const t = frame - land;
  if (t < 0 || t > dur) return { x: 0, y: 0 };
  const decay = 1 - t / dur;
  return {
    x: noise2D("shake-x", frame * 1.7, 0) * amp * decay,
    y: noise2D("shake-y", frame * 1.7, 99) * amp * decay,
  };
};

// Blinking terminal cursor (≈1s cycle, classic ~530ms half period).
const CursorBlink: React.FC<{ frame: number; color?: string; size: number }> = ({
  frame,
  color = "#F4F4F4",
  size,
}) => {
  const on = Math.floor(frame / 16) % 2 === 0;
  return (
    <span
      style={{
        display: "inline-block",
        width: size * 0.55,
        height: size,
        marginLeft: size * 0.14,
        transform: "translateY(0.12em)",
        background: color,
        opacity: on ? 1 : 0.12,
      }}
    />
  );
};

// Scale-punch entrance: overshoots then settles. Returns {scale, opacity}.
const punch = (frame: number, land: number, fps: number, overshoot = 1) => {
  const s = spring({
    frame: frame - land,
    fps,
    config: { damping: 11, mass: 0.7, stiffness: 150 },
    durationInFrames: 20,
  });
  const opacity = clamp01((frame - land) / 4);
  const scale = interpolate(s, [0, 1], [1 + 0.22 * overshoot, 1]);
  return { scale, opacity };
};

// ── DARK HALF ─────────────────────────────────────────────────────────────────
// One thought at a time, centre stage, white mono on black. First line is typed
// (establishes the 2am terminal), the rest punch in on the heartbeat.
const DarkHalf: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Line 1 — typewriter "It's 2:14 AM." (start beat 1 = f30).
  const typeStart = 30;
  const line1 = "It's 2:14 AM.";
  const chars = Math.max(0, Math.min(line1.length, Math.floor((frame - typeStart) / 3)));

  // Which stage of the confession/damage are we in?
  // Beats: 90 product, 120 post, 150 screenshot, 180 prayer, 240/270/300 damage.
  type Line = { at: number; until: number; big?: boolean; damage?: boolean };
  const lines: Record<string, Line> = {
    product: { at: 90, until: 120 },
    post: { at: 120, until: 150 },
    shot: { at: 150, until: 180 },
    prayer: { at: 180, until: 240, big: true },
    d1: { at: 240, until: 270, damage: true },
    d2: { at: 270, until: 300, damage: true },
    d3: { at: 300, until: FLIP, damage: true },
  };

  const shakeSources = [90, 120, 150, 180, 240, 270, 300];
  // Damage landings shake harder.
  let sh = { x: 0, y: 0 };
  for (const s of shakeSources) {
    const amp = s >= 240 ? 4.5 : s === 180 ? 3.5 : 0;
    if (amp > 0) {
      const k = shakeAt(frame, s, amp);
      sh = { x: sh.x + k.x, y: sh.y + k.y };
    }
  }

  const white = "#F4F4F4";
  const dim = "#6B6B6B";

  return (
    <AbsoluteFill
      style={{
        background: "#050505",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: MONO,
        transform: `translate(${sh.x}px, ${sh.y}px)`,
      }}
    >
      {/* persistent tiny clock, top-left, blinking colon feel */}
      <div
        style={{
          position: "absolute",
          top: 64,
          left: 72,
          fontSize: 26,
          letterSpacing: 4,
          color: dim,
          opacity: interpolate(frame, [24, 60], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        02:14 · the night before launch
      </div>

      {/* Stage 1: a lone blinking cursor arrives out of the dark (~f6), then types
          the opener, held with the cursor until the punches begin. */}
      {frame >= 6 && frame < 90 && (
        <div style={{ fontSize: 132, fontWeight: 800, color: white, letterSpacing: -2 }}>
          {line1.slice(0, chars)}
          <CursorBlink frame={frame} size={112} />
        </div>
      )}

      {/* Stage 2: confession punches */}
      {frame >= lines.product.at && frame < lines.product.until && (
        <ConfessionLine frame={frame} land={lines.product.at} fps={fps}>
          <span style={{ color: white }}>Your product ships </span>
          <span style={{ color: COLORS.yellow }}>tomorrow.</span>
        </ConfessionLine>
      )}
      {frame >= lines.post.at && frame < lines.post.until && (
        <ConfessionLine frame={frame} land={lines.post.at} fps={fps} size={104}>
          <span style={{ color: dim }}>Your launch post:</span>
        </ConfessionLine>
      )}
      {frame >= lines.shot.at && frame < lines.shot.until && (
        <ConfessionLine frame={frame} land={lines.shot.at} fps={fps}>
          <span style={{ color: white }}>a screenshot.</span>
        </ConfessionLine>
      )}
      {frame >= lines.prayer.at && frame < lines.prayer.until && (
        <ConfessionLine frame={frame} land={lines.prayer.at} fps={fps} size={176} overshoot={1.5}>
          <span style={{ color: dim, fontSize: 76 }}>and a </span>
          <span style={{ color: white }}>prayer.</span>{" "}
          <span style={{ fontSize: 150 }}>🙏</span>
        </ConfessionLine>
      )}

      {/* Stage 3: the damage — big number is the hero */}
      {frame >= lines.d1.at && frame < lines.d1.until && (
        <DamageLine frame={frame} land={lines.d1.at} fps={fps} num="14" tail="likes." />
      )}
      {frame >= lines.d2.at && frame < lines.d2.until && (
        <DamageLine frame={frame} land={lines.d2.at} fps={fps} num="3" tail="are your cofounder." />
      )}
      {frame >= lines.d3.at && frame < FLIP && (
        <DamageLine
          frame={frame}
          land={lines.d3.at}
          fps={fps}
          num="1"
          tail="is your mom."
          cursor
        />
      )}
    </AbsoluteFill>
  );
};

const ConfessionLine: React.FC<{
  frame: number;
  land: number;
  fps: number;
  size?: number;
  overshoot?: number;
  children: React.ReactNode;
}> = ({ frame, land, fps, size = 116, overshoot = 1, children }) => {
  const { scale, opacity } = punch(frame, land, fps, overshoot);
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: -2,
        textAlign: "center",
        lineHeight: 1.05,
        transform: `scale(${scale})`,
        opacity,
        maxWidth: 1500,
      }}
    >
      {children}
    </div>
  );
};

const DamageLine: React.FC<{
  frame: number;
  land: number;
  fps: number;
  num: string;
  tail: string;
  cursor?: boolean;
}> = ({ frame, land, fps, num, tail, cursor }) => {
  const { scale, opacity } = punch(frame, land, fps, 1.4);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 340,
          lineHeight: 0.9,
          color: "#F4F4F4",
          letterSpacing: -6,
        }}
      >
        {num}
        {cursor && <CursorBlink frame={frame} size={220} />}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 72, fontWeight: 700, color: "#8A8A8A" }}>
        {tail}
      </div>
    </div>
  );
};

// ── POP HALF ──────────────────────────────────────────────────────────────────
const PopHalf: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: DISPLAY, overflow: "hidden" }}>
      {/* Radial bloom that blows out of centre on the slam, then settles. */}
      <Bloom frame={frame} />

      {frame >= FLIP && frame < 390 && <FlipLine frame={frame} fps={fps} />}
      {frame >= 390 && frame < 450 && <IntakeBeat frame={frame} fps={fps} />}
      {frame >= 450 && frame < 540 && <CrewBeat frame={frame} fps={fps} />}
      {frame >= 540 && frame < 600 && <StoryboardBeat frame={frame} fps={fps} />}
      {frame >= 600 && frame < 660 && <DeliverablesBeat frame={frame} fps={fps} />}
      {frame >= 660 && frame < 780 && <OfferBeat frame={frame} fps={fps} />}
      {frame >= 780 && <EndCard frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};

const Bloom: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame - FLIP;
  const r = interpolate(t, [0, 24], [10, 160], { extrapolateRight: "clamp" });
  const o = interpolate(t, [0, 10, 40], [0.9, 0.5, 0], { extrapolateRight: "clamp" });
  if (t < 0 || o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 46%, ${COLORS.yellow} 0%, rgba(255,201,60,0) ${r}%)`,
        opacity: o,
      }}
    />
  );
};

const FlipLine: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const { scale, opacity } = punch(frame, FLIP, fps, 1.6);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontSize: 150,
          color: COLORS.ink,
          textAlign: "center",
          lineHeight: 0.98,
          letterSpacing: -3,
          transform: `scale(${scale})`,
          opacity,
          maxWidth: 1550,
        }}
      >
        There&rsquo;s a{" "}
        <span
          style={{
            color: COLORS.paper,
            background: COLORS.pink,
            padding: "0 22px",
            borderRadius: 14,
            border: CHROME.border,
            boxShadow: CHROME.shadowSm,
            display: "inline-block",
            transform: "rotate(-2deg)",
          }}
        >
          crew
        </span>{" "}
        for this now.
      </div>
    </AbsoluteFill>
  );
};

// Beat 4a — paste your URL, real intake field rebuild.
const IntakeBeat: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 390;
  const head = punch(frame, start, fps, 0.8);
  const card = spring({ frame: frame - start - 5, fps, config: { damping: 14 }, durationInFrames: 18 });
  const caretOn = Math.floor(frame / 14) % 2 === 0;
  const arrow = spring({ frame: frame - start - 22, fps, config: { damping: 10, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 46 }}>
      <div
        style={{
          fontSize: 108,
          color: COLORS.ink,
          transform: `scale(${head.scale})`,
          opacity: head.opacity,
          letterSpacing: -2,
        }}
      >
        Paste your URL
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
          opacity: card,
        }}
      >
        <div
          style={{
            width: 900,
            height: 128,
            background: COLORS.paper,
            border: "4px solid " + COLORS.ink,
            boxShadow: "8px 8px 0 " + COLORS.ink,
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            padding: "0 38px",
            fontFamily: MONO,
            fontSize: 54,
            fontWeight: 700,
            color: COLORS.ink,
          }}
        >
          <span style={{ color: COLORS.blue, marginRight: 4 }}>https://</span>
          yourstartup.com
          <span
            style={{
              display: "inline-block",
              width: 4,
              height: 62,
              background: COLORS.ink,
              marginLeft: 6,
              opacity: caretOn ? 1 : 0,
            }}
          />
        </div>
        <div
          style={{
            width: 128,
            height: 128,
            background: COLORS.yellow,
            border: "4px solid " + COLORS.ink,
            boxShadow: "8px 8px 0 " + COLORS.ink,
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 66,
            transform: `scale(${interpolate(arrow, [0, 1], [0.4, 1])})`,
          }}
        >
          →
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Beat 4b — the five crew members light up in sequence.
const CrewBeat: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 450;
  const label = punch(frame, start, fps, 0.6);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 60 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 8,
          color: COLORS.ink,
          opacity: label.opacity,
          textTransform: "uppercase",
        }}
      >
        the crew is on it
      </div>
      <div style={{ display: "flex", gap: 30 }}>
        {CREW.map((c, i) => {
          const land = start + 6 + i * 18;
          const lit = frame >= land;
          const s = spring({ frame: frame - land, fps, config: { damping: 9, stiffness: 170 }, durationInFrames: 16 });
          const scale = lit ? interpolate(s, [0, 1], [0.3, 1]) : 0;
          return (
            <div
              key={c.name}
              style={{
                width: 250,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                transform: `scale(${scale})`,
                opacity: lit ? 1 : 0,
              }}
            >
              <div
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: 28,
                  background: c.color,
                  border: "4px solid " + COLORS.ink,
                  boxShadow: "6px 6px 0 " + COLORS.ink,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 80,
                }}
              >
                {c.emoji}
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 38, color: COLORS.ink }}>{c.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: COLORS.ink, opacity: 0.6 }}>
                {c.role}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Beat 4c — the storyboard row snaps into place.
const StoryboardBeat: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 540;
  const scenes = [
    { name: "Hook", emoji: "🎣", color: COLORS.blue },
    { name: "Problem", emoji: "😵", color: COLORS.orange },
    { name: "Tour A", emoji: "🖥️", color: COLORS.purple },
    { name: "Tour B", emoji: "✨", color: COLORS.pink },
    { name: "Proof", emoji: "⭐", color: COLORS.yellow },
    { name: "CTA", emoji: "🚀", color: COLORS.green },
  ];
  const head = punch(frame, start, fps, 0.6);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 50 }}>
      <div style={{ fontSize: 78, color: COLORS.ink, opacity: head.opacity, transform: `scale(${head.scale})` }}>
        Storyboard — 6 scenes
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {scenes.map((s, i) => {
          const land = start + 6 + i * 8;
          const sp = spring({ frame: frame - land, fps, config: { damping: 12, stiffness: 180 }, durationInFrames: 14 });
          return (
            <div
              key={s.name}
              style={{
                width: 236,
                height: 260,
                background: COLORS.paper,
                border: "4px solid " + COLORS.ink,
                boxShadow: "7px 7px 0 " + COLORS.ink,
                borderRadius: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 20,
                transform: `translateY(${interpolate(sp, [0, 1], [70, 0])}px) rotate(${interpolate(
                  sp,
                  [0, 1],
                  [-6, 0]
                )}deg)`,
                opacity: clamp01((frame - land) / 4),
              }}
            >
              <div style={{ fontSize: 84 }}>{s.emoji}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 34, color: COLORS.ink }}>{s.name}</div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 20,
                  fontWeight: 700,
                  color: COLORS.ink,
                  background: s.color,
                  border: "2px solid " + COLORS.ink,
                  borderRadius: 8,
                  padding: "2px 12px",
                }}
              >
                ready
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Ghosted UI fragments that each deliverable word is stamped over.
const FragVideo: React.FC = () => (
  <svg width={520} height={300} viewBox="0 0 520 300" fill="none">
    <rect x={6} y={6} width={508} height={288} rx={24} stroke={COLORS.ink} strokeWidth={8} />
    <rect x={6} y={6} width={508} height={54} rx={24} fill={COLORS.ink} opacity={0.5} />
    <path d="M232 118 L232 200 L300 159 Z" fill={COLORS.ink} />
  </svg>
);
const FragWave: React.FC = () => (
  <svg width={520} height={300} viewBox="0 0 520 300" fill="none">
    {[40, 120, 220, 90, 260, 150, 60, 200, 110, 240, 70, 180].map((h, i) => (
      <rect key={i} x={30 + i * 40} y={150 - h / 2} width={20} height={h} rx={10} fill={COLORS.ink} />
    ))}
  </svg>
);
const FragPage: React.FC = () => (
  <svg width={520} height={300} viewBox="0 0 520 300" fill="none">
    <rect x={6} y={6} width={508} height={288} rx={24} stroke={COLORS.ink} strokeWidth={8} />
    <rect x={6} y={6} width={508} height={56} rx={24} fill={COLORS.ink} opacity={0.5} />
    <circle cx={44} cy={34} r={10} fill={COLORS.paper} />
    <circle cx={80} cy={34} r={10} fill={COLORS.paper} />
    <circle cx={116} cy={34} r={10} fill={COLORS.paper} />
    <rect x={40} y={110} width={280} height={26} rx={13} fill={COLORS.ink} />
    <rect x={40} y={160} width={440} height={18} rx={9} fill={COLORS.ink} opacity={0.6} />
    <rect x={40} y={196} width={380} height={18} rx={9} fill={COLORS.ink} opacity={0.6} />
  </svg>
);

// Beat 4d — "trailer. voiceover. premiere page." each stamped over a matching
// ghosted UI fragment (the three things the crew hands back).
const DeliverablesBeat: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 600;
  const words = [
    { w: "trailer.", at: start, color: COLORS.pink, frag: <FragVideo /> },
    { w: "voiceover.", at: start + 20, color: COLORS.blue, frag: <FragWave /> },
    { w: "premiere page.", at: start + 40, color: COLORS.green, frag: <FragPage /> },
  ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 4 }}>
      {words.map((it) => {
        const t = frame - it.at;
        const visible = t >= 0;
        const stamp = spring({ frame: t, fps, config: { damping: 8, mass: 0.6, stiffness: 200 }, durationInFrames: 12 });
        const scale = interpolate(stamp, [0, 1], [1.6, 1]);
        const rot = interpolate(stamp, [0, 1], [-4, -1.5]);
        return (
          <div
            key={it.w}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: visible ? clamp01(t / 3) : 0,
              transform: `scale(${visible ? scale : 1.6}) rotate(${rot}deg)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                opacity: 0.12,
                display: "flex",
              }}
            >
              {it.frag}
            </div>
            <div style={{ fontSize: 128, color: it.color, letterSpacing: -2, position: "relative" }}>{it.w}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Beat 5 — the offer, slowed down.
const OfferBeat: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 660;
  const card = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 22 });
  const lines = [
    { at: start + 8, main: "Free teaser", tail: " — tonight.", accent: COLORS.green },
    { at: start + 30, main: "₹999", tail: " — the full trailer.", accent: COLORS.yellow },
  ];
  const closer = punch(frame, start + 56, fps, 0.7);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          background: COLORS.paper,
          border: "6px solid " + COLORS.ink,
          boxShadow: "14px 14px 0 " + COLORS.ink,
          borderRadius: 30,
          padding: "70px 90px",
          display: "flex",
          flexDirection: "column",
          gap: 34,
          alignItems: "flex-start",
          transform: `translateY(${interpolate(card, [0, 1], [60, 0])}px) scale(${interpolate(
            card,
            [0, 1],
            [0.9, 1]
          )})`,
          opacity: card,
        }}
      >
        {lines.map((l) => {
          const o = clamp01((frame - l.at) / 6);
          const x = interpolate(o, [0, 1], [-30, 0]);
          return (
            <div key={l.main} style={{ fontSize: 92, color: COLORS.ink, opacity: o, transform: `translateX(${x}px)` }}>
              <span
                style={{
                  background: l.accent,
                  border: "3px solid " + COLORS.ink,
                  borderRadius: 12,
                  padding: "0 18px",
                }}
              >
                {l.main}
              </span>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64 }}>{l.tail}</span>
            </div>
          );
        })}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 52,
            fontWeight: 700,
            color: COLORS.ink,
            opacity: closer.opacity,
            transform: `scale(${closer.scale})`,
            marginTop: 6,
          }}
        >
          You&rsquo;ve already done the hard part.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── End card (loop-friendly resting frame) ─────────────────────────────────────
const QR_MATRIX = qrMatrix(`https://${PRODUCT.url}`, "M");

const QRCode: React.FC<{ px: number }> = ({ px }) => {
  const n = QR_MATRIX.length;
  const quiet = 4;
  const dim = n + quiet * 2;
  const cell = px / dim;
  return (
    <svg width={px} height={px} viewBox={`0 0 ${dim} ${dim}`} style={{ display: "block" }}>
      <rect x={0} y={0} width={dim} height={dim} fill={COLORS.paper} />
      {QR_MATRIX.flatMap((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1.02} height={1.02} fill={COLORS.ink} />
          ) : null
        )
      )}
    </svg>
  );
};

const EndCard: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const start = 780;
  const mark = spring({ frame: frame - start, fps, config: { damping: 13, stiffness: 140 }, durationInFrames: 18 });
  const qr = spring({ frame: frame - start - 14, fps, config: { damping: 14 }, durationInFrames: 18 });
  const tagO = clamp01((frame - start - 26) / 8);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 90 }}>
        {/* left: wordmark + url + tagline + price anchor */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            transform: `translateY(${interpolate(mark, [0, 1], [40, 0])}px)`,
            opacity: mark,
          }}
        >
          <div style={{ fontSize: 128, color: COLORS.ink, letterSpacing: -3 }}>
            Launch
            <span
              style={{
                color: COLORS.paper,
                background: COLORS.pink,
                border: CHROME.border,
                boxShadow: CHROME.shadowSm,
                borderRadius: 16,
                padding: "0 20px",
                marginLeft: 12,
              }}
            >
              Reel
            </span>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 66,
              fontWeight: 700,
              color: COLORS.blue,
            }}
          >
            {PRODUCT.url}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 46, fontWeight: 700, color: COLORS.ink, opacity: tagO }}>
            ship the launch too.
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 30,
              fontWeight: 600,
              color: COLORS.ink,
              opacity: tagO * 0.75,
            }}
          >
            free teaser tonight · full trailer from ₹999
          </div>
        </div>

        {/* right: real scannable QR in a brutalist frame */}
        <div
          style={{
            background: COLORS.paper,
            border: "6px solid " + COLORS.ink,
            boxShadow: "12px 12px 0 " + COLORS.ink,
            borderRadius: 24,
            padding: 26,
            transform: `scale(${interpolate(qr, [0, 1], [0.6, 1])})`,
            opacity: qr,
          }}
        >
          <QRCode px={360} />
          <div
            style={{
              fontFamily: MONO,
              fontSize: 26,
              fontWeight: 700,
              color: COLORS.ink,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            scan → free teaser
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── White slam flash at the flip ───────────────────────────────────────────────
const FlipFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [FLIP - 1, FLIP, FLIP + 10], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "#FFFFFF", opacity: o }} />;
};

// ── Root composition ───────────────────────────────────────────────────────────
export const MidnightLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      {frame < FLIP ? <DarkHalf /> : <PopHalf />}
      <FlipFlash />

      {/* Dark ambient pulse: silent through the hook, fades in under the confession,
          hard-cuts at the flip. */}
      <Sequence from={0} durationInFrames={FLIP}>
        <Audio
          src={staticFile("gen/midnight-launch/music-dark.mp3")}
          volume={(f) =>
            f < 24
              ? 0
              : f > FLIP - 8
              ? interpolate(f, [FLIP - 8, FLIP - 1], [0.75, 0], { extrapolateRight: "clamp" })
              : interpolate(f, [24, 110], [0, 0.78], { extrapolateRight: "clamp" })
          }
        />
      </Sequence>

      {/* Triumphant drop: slams in on the flip, trimmed to its full-energy region so
          the beat hits immediately (measured onset ≈ 5s into the cue). */}
      <Sequence from={FLIP} durationInFrames={900 - FLIP}>
        <Audio
          src={staticFile("gen/midnight-launch/music-pop.mp3")}
          startFrom={150}
          volume={(f) => interpolate(f, [0, 2], [0, 0.95], { extrapolateRight: "clamp" })}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
