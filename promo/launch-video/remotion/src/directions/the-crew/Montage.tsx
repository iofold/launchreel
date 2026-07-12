import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CREW } from "../../lib/brand";
import { FONT_DISPLAY, FONT_MONO, INK, T } from "./theme";
import { Paper } from "./Primitives";
import { SplitFlap, mmss } from "./SplitFlap";

const STAGES = ["RESEARCH", "STORYBOARD", "VOICEOVER", "RENDER", "PUBLISH"] as const;
const SCENE_ICONS = ["🔍", "💡", "🎬", "🎙️", "✨", "🚀"] as const;

const Chip: React.FC<{ label: string; color: string; status: 0 | 1 | 2; frame: number }> = ({
  label,
  color,
  status,
  frame,
}) => {
  const bg = status === 2 ? color : status === 1 ? COLORS.yellow : COLORS.paper;
  const txt = status === 0 ? "#9a8f78" : INK;
  const pulse = status === 1 ? 0.5 + 0.5 * Math.abs(Math.sin(frame * 0.35)) : 1;
  const statusLabel = status === 2 ? "done" : status === 1 ? "working" : "waiting";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        width: 236,
      }}
    >
      <div
        style={{
          width: 200,
          height: 84,
          background: bg,
          border: `4px solid ${INK}`,
          borderRadius: 14,
          boxShadow: status === 0 ? "none" : `5px 5px 0 ${INK}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_MONO,
          fontWeight: 500,
          fontSize: 20,
          letterSpacing: 1.5,
          color: txt,
          opacity: status === 0 ? 0.72 : 1,
          transform: status === 1 ? `translateY(${-2 + 2 * pulse}px)` : "none",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_MONO, fontSize: 17, color: txt }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: status === 2 ? COLORS.green : status === 1 ? COLORS.yellow : "#c9bd9f", border: `2px solid ${INK}`, opacity: pulse }} />
        {status === 2 ? "✓ done" : statusLabel}
      </div>
    </div>
  );
};

export const Montage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - T.montage.start;
  const dur = T.montage.end - T.montage.start;

  // --- split-flap countdown ---
  const tickEvery = 5;
  const tickIdx = Math.floor(local / tickEvery);
  const sinceTick = local - tickIdx * tickEvery;
  const flip = interpolate(sinceTick, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  const secAt = (ti: number) => {
    const totalTicks = Math.floor(dur / tickEvery);
    const t = Math.min(1, Math.max(0, ti / totalTicks));
    const eased = 1 - Math.pow(1 - t, 1.7);
    return 287 - eased * (287 - 6); // 04:47 -> 00:06
  };
  const text = `T–${mmss(secAt(tickIdx))}`;
  const prevText = `T–${mmss(secAt(Math.max(0, tickIdx - 1)))}`;

  // --- pipeline chip statuses (staggered) ---
  const statusOf = (i: number): 0 | 1 | 2 => {
    const startWork = 4 + i * 32;
    const done = startWork + 27;
    if (local >= done) return 2;
    if (local >= startWork) return 1;
    return 0;
  };

  // --- header / entrance ---
  const headOp = interpolate(local, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Paper brackets>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 96 }}>
        {/* header */}
        <div style={{ opacity: headOp, fontFamily: FONT_MONO, fontSize: 24, letterSpacing: 14, color: "#8a7f68" }}>
          THE&nbsp;&nbsp;JOB
        </div>
        <div style={{ opacity: headOp, fontFamily: FONT_DISPLAY, fontSize: 60, color: INK, marginTop: 6, letterSpacing: 1 }}>
          THE CREW WORKS
        </div>

        {/* split-flap counter */}
        <div style={{ marginTop: 30, display: "flex", alignItems: "center", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 20, letterSpacing: 10, color: "#8a7f68" }}>DEADLINE COUNTDOWN</div>
          <SplitFlap text={text} prevText={prevText} flip={flip} size={104} />
        </div>

        {/* pipeline chips row */}
        <div style={{ marginTop: 54, display: "flex", justifyContent: "center", gap: 8 }}>
          {STAGES.map((s, i) => (
            <React.Fragment key={s}>
              <Chip label={s} color={CREW[i].color} status={statusOf(i)} frame={frame} />
              {i < STAGES.length - 1 && (
                <div style={{ alignSelf: "flex-start", marginTop: 34, fontFamily: FONT_MONO, fontSize: 28, color: statusOf(i) === 2 ? INK : "#c9bd9f" }}>›</div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* storyboard thumbnails + waveform, symmetric bottom band */}
        <div style={{ marginTop: 52, display: "flex", alignItems: "center", gap: 40 }}>
          {/* storyboard strip */}
          <div style={{ display: "flex", gap: 12 }}>
            {SCENE_ICONS.map((ic, i) => {
              const appear = spring({ frame: local - (70 + i * 9), fps, config: { damping: 13, stiffness: 160 }, durationInFrames: 18 });
              return (
                <div
                  key={i}
                  style={{
                    width: 92,
                    height: 66,
                    background: [COLORS.sky, COLORS.cream, COLORS.paper][i % 3],
                    border: `3px solid ${INK}`,
                    borderRadius: 10,
                    boxShadow: `3px 3px 0 ${INK}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 30,
                    transform: `scale(${appear}) translateY(${interpolate(appear, [0, 1], [16, 0])}px)`,
                    opacity: appear,
                  }}
                >
                  {ic}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: FONT_MONO, fontSize: 17, letterSpacing: 6, color: "#8a7f68" }}>STORYBOARD · 6 SCENES</div>

        {/* waveform (voiceover) */}
        <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 5, height: 70 }}>
          {Array.from({ length: 48 }).map((_, i) => {
            const active = local > 46;
            const h = active ? 8 + Math.abs(Math.sin(frame * 0.3 + i * 0.5)) * (16 + (i % 5) * 8) : 6;
            return <div key={i} style={{ width: 7, height: h, background: i % 2 ? COLORS.pink : COLORS.purple, borderRadius: 4 }} />;
          })}
        </div>
        <div style={{ marginTop: 6, fontFamily: FONT_MONO, fontSize: 17, letterSpacing: 6, color: "#8a7f68" }}>VOICEOVER · RENDERING</div>
      </AbsoluteFill>
    </Paper>
  );
};
