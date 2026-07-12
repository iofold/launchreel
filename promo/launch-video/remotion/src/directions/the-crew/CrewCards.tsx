import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS, CREW } from "../../lib/brand";
import { FONT_DISPLAY, FONT_MONO, FONT_SANS, INK, CREW_LINES, T } from "./theme";
import { Bot } from "./Bot";
import { Paper } from "./Primitives";

const W = 1920;
const PER = T.cards.per;
const WHIP = 7;

// One dossier title card. Identical layout for all five — symmetry is the joke.
const Card: React.FC<{ index: number; activeStart: number }> = ({ index, activeStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const member = CREW[index];
  const line = CREW_LINES[index];
  const local = frame - activeStart;
  // entrance: avatar pop + text rise when this card lands
  const pop = spring({ frame: local, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 22 });
  const avScale = interpolate(pop, [0, 1], [0.6, 1]);
  const rise = interpolate(pop, [0, 1], [26, 0]);
  const textOp = interpolate(local, [2, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const blink = local % 46 > 42; // occasional blink

  return (
    <div style={{ width: W, height: 1080, position: "relative", flexShrink: 0 }}>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* top meta row, symmetric */}
        <div style={{ position: "absolute", top: 96, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 28, alignItems: "center", fontFamily: FONT_MONO, fontSize: 22, letterSpacing: 8, color: "#8a7f68" }}>
          <span>CREW FILE</span>
          <span style={{ color: member.color, fontSize: 26 }}>◆</span>
          <span>{line.tag}</span>
        </div>

        {/* dossier headshot plate */}
        <div
          style={{
            transform: `scale(${avScale})`,
            width: 340,
            height: 340,
            background: COLORS.paper,
            border: `5px solid ${INK}`,
            borderRadius: 28,
            boxShadow: `14px 14px 0 ${member.color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: 44,
          }}
        >
          {/* file-tab corner */}
          <div style={{ position: "absolute", top: -5, right: 26, width: 70, height: 26, background: member.color, border: `4px solid ${INK}`, borderTop: "none", borderRadius: "0 0 8px 8px" }} />
          <div style={{ transform: "translateY(6px)" }}>
            <Bot index={index} size={252} blink={blink} />
          </div>
        </div>

        {/* huge name */}
        <div style={{ transform: `translateY(${rise}px)`, fontFamily: FONT_DISPLAY, fontSize: 132, lineHeight: 0.9, color: INK, letterSpacing: 2, textTransform: "uppercase" }}>
          {member.name}
        </div>
        {/* specialty */}
        <div style={{ opacity: textOp, marginTop: 14, fontFamily: FONT_MONO, fontSize: 30, letterSpacing: 12, color: member.color, textTransform: "uppercase", fontWeight: 500 }}>
          {member.role}
        </div>
        {/* rule */}
        <div style={{ opacity: textOp, width: 300, height: 3, background: INK, margin: "26px 0 22px" }} />
        {/* credential one-liner */}
        <div style={{ opacity: textOp, fontFamily: FONT_SANS, fontStyle: "italic", fontSize: 34, color: "#463b26" }}>
          &ldquo;{line.credential}&rdquo;
        </div>

        {/* bottom index, centered */}
        <div style={{ position: "absolute", bottom: 92, left: 0, right: 0, textAlign: "center", fontFamily: FONT_MONO, fontSize: 24, letterSpacing: 10, color: "#8a7f68" }}>
          <span style={{ color: INK, fontWeight: 500 }}>{String(index + 1).padStart(2, "0")}</span>
          <span> / 5 · SPECIALIST</span>
        </div>
      </AbsoluteFill>
    </div>
  );
};

export const CrewCards: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - T.cards.start;
  const idx = Math.max(0, Math.min(4, Math.floor(local / PER)));
  const within = local - idx * PER;

  let pos = idx;
  let blur = 0;
  if (idx < 4 && within > PER - WHIP) {
    const p = (within - (PER - WHIP)) / WHIP; // 0..1
    const e = Easing.inOut(Easing.cubic)(p);
    pos = idx + e;
    blur = Math.sin(p * Math.PI) * 30;
  }
  const rowX = -pos * W;

  return (
    <Paper brackets={false} vignette>
      {/* hidden horizontal-blur filter for the whip */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="tc-hblur" x="-20%" y="-5%" width="140%" height="110%">
          <feGaussianBlur stdDeviation={`${blur} 0`} />
        </filter>
      </svg>
      <div
        style={{
          display: "flex",
          width: W * 5,
          height: 1080,
          transform: `translateX(${rowX}px)`,
          filter: blur > 0.3 ? "url(#tc-hblur)" : "none",
        }}
      >
        {CREW.map((_, i) => (
          <Card key={i} index={i} activeStart={T.cards.start + i * PER} />
        ))}
      </div>
      {/* whoosh streaks during whip */}
      {blur > 6 &&
        [0.28, 0.5, 0.72].map((yy, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${yy * 100}%`,
              left: 0,
              width: "100%",
              height: 3,
              background: `linear-gradient(90deg, transparent, ${INK}22 40%, ${INK}55 50%, ${INK}22 60%, transparent)`,
              opacity: interpolate(blur, [6, 30], [0, 0.7]),
            }}
          />
        ))}
    </Paper>
  );
};
