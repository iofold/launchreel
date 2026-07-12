// CH 03 (360–450f) — THE CREW as a live control room. 5 agent tiles light up
// left→right, a pipeline line fills, then the render bar runs.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CHROME, CREW } from "../../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "../theme";
import { ChannelBug } from "../chrome";

const ROOM = "#0e1122";

const AgentTile: React.FC<{
  agent: (typeof CREW)[number];
  activateAt: number;
  frame: number;
  fps: number;
}> = ({ agent, activateAt, frame, fps }) => {
  const s = spring({ frame: frame - activateAt, fps, config: { damping: 9, mass: 0.6 }, durationInFrames: 14 });
  const live = frame >= activateAt;
  const done = frame >= activateAt + 12;
  const pop = interpolate(s, [0, 1], [1, 1.06]);
  return (
    <div
      style={{
        width: 300,
        padding: "26px 18px 22px",
        borderRadius: 22,
        background: live ? agent.color : "#1b1f33",
        border: `4px solid ${live ? COLORS.ink : "#2b3050"}`,
        boxShadow: live ? `0 0 34px ${agent.color}, 8px 8px 0 ${COLORS.ink}` : "none",
        transform: `translateY(${live ? -8 * (2 - pop) : 0}px) scale(${live ? pop : 0.96})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transition: "none",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 999,
          background: live ? COLORS.paper : "#252a42",
          border: `4px solid ${COLORS.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 52,
          filter: live ? "none" : "grayscale(1) brightness(0.6)",
        }}
      >
        {agent.emoji}
      </div>
      <div style={{ fontFamily: ARCHIVO, fontSize: 32, color: live ? COLORS.ink : "#7b82a6" }}>{agent.name}</div>
      <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 20, color: live ? COLORS.ink : "#6b7099", opacity: 0.85 }}>{agent.role}</div>
      <div
        style={{
          marginTop: 4,
          padding: "6px 16px",
          borderRadius: 999,
          fontFamily: ARCHIVO,
          fontSize: 20,
          letterSpacing: 1,
          background: done ? COLORS.ink : live ? COLORS.paper : "#2b3050",
          color: done ? COLORS.green : live ? COLORS.ink : "#6b7099",
        }}
      >
        {done ? "DONE ✓" : live ? "WORKING…" : "QUEUED"}
      </div>
    </div>
  );
};

export const CrewRoom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const step = 12;
  const startAt = 6;
  const lastDone = startAt + (CREW.length - 1) * step + 12;

  // pipeline line fills across the tiles as they activate
  const lineFill = interpolate(frame, [startAt, lastDone], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // render bar after the crew finishes
  const render = interpolate(frame, [lastDone, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: ROOM }}>
      {/* faint control-room grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.blue}22 1px, transparent 1px), linear-gradient(90deg, ${COLORS.blue}22 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.5,
        }}
      />

      <div style={{ position: "absolute", top: 42, left: 56, display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ padding: "8px 18px 6px", background: COLORS.pink, borderRadius: 10, fontFamily: ARCHIVO, fontSize: 24, letterSpacing: 3, color: COLORS.paper }}>
          ● LIVE PIPELINE
        </div>
        <div style={{ fontFamily: ANTON, fontSize: 40, color: COLORS.paper, letterSpacing: 2 }}>THE CREW IS ON IT</div>
      </div>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {/* connecting pipeline line behind tiles */}
        <div style={{ position: "relative", width: 1580, height: 8, marginBottom: 8 }}>
          <div style={{ position: "absolute", inset: 0, background: "#252a42", borderRadius: 999 }} />
          <div style={{ position: "absolute", top: 0, left: 0, height: 8, width: `${lineFill * 100}%`, background: COLORS.green, borderRadius: 999, boxShadow: `0 0 16px ${COLORS.green}` }} />
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {CREW.map((a, i) => (
            <AgentTile key={a.name} agent={a} activateAt={startAt + i * step} frame={frame} fps={fps} />
          ))}
        </div>

        {/* render progress */}
        <div style={{ width: 1580, marginTop: 54 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ARCHIVO, fontSize: 26, color: COLORS.paper, marginBottom: 12 }}>
            <span>⚙ RENDERING YOUR TRAILER</span>
            <span style={{ color: COLORS.yellow }}>{Math.round(render * 100)}%</span>
          </div>
          <div style={{ height: 30, borderRadius: 999, background: "#252a42", border: `4px solid ${COLORS.ink}`, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${render * 100}%`, background: COLORS.yellow, boxShadow: `0 0 18px ${COLORS.yellow}` }} />
          </div>
        </div>
      </AbsoluteFill>

      <ChannelBug n="03" tint={COLORS.green} />
    </AbsoluteFill>
  );
};
