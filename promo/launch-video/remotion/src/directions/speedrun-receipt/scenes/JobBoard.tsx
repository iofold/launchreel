// THE CREW WORKS (8–20s) — job board rebuilt from full-jobboard.png. Five agents flip
// waiting→working→done, storyboard thumbnails complete, a status feed scrolls, render fills.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../../../lib/brand";
import { UI } from "../fonts";
import { TopNav, Eyebrow, Pill, StatusChip, INK, card } from "../ui";
import { AgentFace } from "../Avatars";
import { AGENTS, agentState, SCENES, FEED, AGENT_COLOR } from "../crewShared";

const CARD_X = 72;
const CARD_W = 1776;

export const JobBoard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 20, mass: 0.7 } });
  const fadeIn = interpolate(frame, [0, 10], [1, 0], { extrapolateRight: "clamp" }); // continue GO flash

  // agent columns
  const pad = 40;
  const innerW = CARD_W - pad * 2;
  const colW = innerW / AGENTS.length;

  const revealed = FEED.filter((l) => l.t <= frame);
  const visible = revealed.slice(-6);

  const renderPct = interpolate(frame, [196, 338], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const etaSec = Math.max(0, Math.ceil((338 - frame) / 30));

  const doneCount = AGENTS.filter((a) => frame >= a.done).length;

  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: UI }}>
      <TopNav active="Job Board" />

      {/* header */}
      <div style={{ position: "absolute", left: CARD_X, top: 100 }}>
        <Eyebrow>LIVE PIPELINE</Eyebrow>
      </div>
      <div style={{ position: "absolute", left: CARD_X, top: 138, fontWeight: 900, fontSize: 54, color: INK }}>
        The crew is on it 🎬
      </div>
      <div style={{ position: "absolute", left: CARD_X, top: 224, display: "flex", gap: 14 }}>
        <Pill>🏷️ Ledgerly</Pill>
        <Pill>💬 Bookkeeping on autopilot</Pill>
        <Pill>🎬 ₹999 Launch Trailer</Pill>
      </div>

      {/* agents card */}
      <div style={{ position: "absolute", left: CARD_X, top: 296, width: CARD_W, height: 258, ...card(), opacity: enter }}>
        {AGENTS.map((a, i) => {
          const state = agentState(a, frame);
          const working = state.startsWith("working");
          const isDone = state.startsWith("done");
          const bob = working ? Math.sin(frame * 0.5 + i) * 5 : 0;
          const donePop = isDone
            ? interpolate(spring({ frame: frame - a.done, fps, config: { damping: 8 } }), [0, 1], [1.18, 1])
            : 1;
          const cx = pad + colW * (i + 0.5);
          return (
            <div
              key={a.name}
              style={{
                position: "absolute",
                left: cx,
                top: 30,
                transform: "translateX(-50%)",
                width: colW - 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ transform: `translateY(${bob}px) scale(${donePop})` }}>
                <AgentFace name={a.name} size={94} />
              </div>
              <div style={{ fontWeight: 900, fontSize: 24, color: INK, marginTop: 12 }}>{a.name}</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: INK, opacity: 0.7, marginBottom: 10 }}>{a.role}</div>
              <StatusChip state={state} />
            </div>
          );
        })}
        {/* progress dots */}
        <div style={{ position: "absolute", bottom: 14, left: 0, width: "100%", display: "flex", justifyContent: "center", gap: 12 }}>
          {new Array(AGENTS.length).fill(0).map((_, i) => (
            <div
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                border: `2.5px solid ${INK}`,
                background: i < doneCount ? COLORS.green : i === doneCount ? COLORS.yellow : COLORS.paper,
              }}
            />
          ))}
        </div>
      </div>

      {/* storyboard + render card */}
      <div style={{ position: "absolute", left: CARD_X, top: 580, width: 1112, height: 432, ...card(), opacity: enter }}>
        <div style={{ padding: "22px 26px" }}>
          <div style={{ fontWeight: 900, fontSize: 26, color: INK, marginBottom: 16 }}>🎞️ Storyboard — 6 scenes</div>
          <div style={{ display: "flex", gap: 14 }}>
            {SCENES.map((s) => {
              const isDone = frame >= s.done;
              const pop = isDone
                ? interpolate(spring({ frame: frame - s.done, fps, config: { damping: 9 } }), [0, 1], [0.6, 1])
                : 1;
              return (
                <div
                  key={s.label}
                  style={{
                    width: 158,
                    height: 132,
                    background: COLORS.paper,
                    border: `3px solid ${INK}`,
                    borderRadius: 12,
                    boxShadow: `3px 3px 0 ${INK}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transform: `scale(${pop})`,
                  }}
                >
                  <div style={{ fontSize: 40 }}>{s.emoji}</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: INK }}>{s.label}</div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "2px 12px",
                      borderRadius: 999,
                      border: `2px solid ${INK}`,
                      background: isDone ? COLORS.green : COLORS.sky,
                      color: INK,
                    }}
                  >
                    {isDone ? "done ✓" : "queued"}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontWeight: 900, fontSize: 24, color: INK, marginTop: 26, marginBottom: 10 }}>⚙️ Render</div>
          <div style={{ height: 30, background: COLORS.paper, border: `3px solid ${INK}`, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${renderPct}%`, height: "100%", background: COLORS.green }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontWeight: 700, fontSize: 18, color: INK }}>
            <span>{renderPct < 5 ? "Waiting for approval…" : renderPct >= 100 ? "Render complete ✓" : `Rendering… ${Math.round(renderPct)}%`}</span>
            <span>{renderPct >= 100 ? "ETA —" : `ETA ${etaSec}s`}</span>
          </div>
        </div>
      </div>

      {/* status feed card */}
      <div style={{ position: "absolute", left: 1216, top: 580, width: 632, height: 432, ...card(), opacity: enter }}>
        <div style={{ padding: "22px 26px", height: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ fontWeight: 900, fontSize: 26, color: INK, marginBottom: 14 }}>📣 Status feed</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((l) => {
              const age = frame - l.t;
              const slide = interpolate(age, [0, 8], [22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const op = interpolate(age, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={l.t} style={{ display: "flex", gap: 12, alignItems: "flex-start", transform: `translateY(${slide}px)`, opacity: op }}>
                  <div style={{ marginTop: 6, minWidth: 16, width: 16, height: 16, borderRadius: 999, background: AGENT_COLOR[l.a], border: `2.5px solid ${INK}` }} />
                  <div style={{ fontSize: 20, color: INK, lineHeight: 1.25, fontWeight: 600 }}>
                    <span style={{ fontWeight: 900 }}>{l.a}:</span> {l.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {fadeIn > 0 && <AbsoluteFill style={{ background: "#fff", opacity: fadeIn, pointerEvents: "none" }} />}
    </AbsoluteFill>
  );
};
