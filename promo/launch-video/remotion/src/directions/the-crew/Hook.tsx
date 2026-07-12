import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../lib/brand";
import { FONT_DISPLAY, FONT_MONO, INK, MANILA, MANILA_EDGE, STAMP_RED } from "./theme";
import { Paper, Stamp } from "./Primitives";

// Tiny recreated "Ledgerly" product screenshot for the paper-clipped polaroid.
const MiniProduct: React.FC = () => (
  <div style={{ width: "100%", height: "100%", background: COLORS.blue, borderRadius: 4, overflow: "hidden", position: "relative" }}>
    <div style={{ height: "26%", background: "#1E44D6", display: "flex", alignItems: "center", padding: "0 10px", gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS.yellow }} />
      <div style={{ color: "#fff", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500 }}>Ledgerly</div>
    </div>
    <div style={{ position: "absolute", top: "34%", left: "8%", color: "#fff", fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 1 }}>
      ₹4.2L
    </div>
    <div style={{ position: "absolute", top: "34%", left: "8%", marginTop: 30, color: "#CDE7FF", fontFamily: FONT_MONO, fontSize: 10 }}>
      books, autopiloted
    </div>
    <div style={{ position: "absolute", bottom: 10, left: "8%", right: "8%", height: "34%", display: "flex", alignItems: "flex-end", gap: 5 }}>
      {[0.4, 0.6, 0.45, 0.75, 0.9, 0.65, 1].map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: i === 6 ? COLORS.green : "#CDE7FF", borderRadius: 2 }} />
      ))}
    </div>
  </div>
);

const Polaroid: React.FC<{ appearAt: number }> = ({ appearAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - appearAt, fps, config: { damping: 14, stiffness: 120 } });
  const y = interpolate(s, [0, 1], [-520, 0]);
  const rot = interpolate(s, [0, 1], [-22, 9]);
  return (
    <div
      style={{
        position: "absolute",
        top: 96,
        right: 150,
        transform: `translateY(${y}px) rotate(${rot}deg)`,
        background: "#FFFEFA",
        padding: "14px 14px 46px",
        boxShadow: "10px 14px 22px rgba(0,0,0,0.28)",
        border: "1px solid #E7E2D2",
      }}
    >
      {/* paper clip */}
      <svg width={64} height={90} viewBox="0 0 64 90" style={{ position: "absolute", top: -34, left: 44 }}>
        <path d="M32 12 v46 a14 14 0 0 0 28 0 v-40 a20 20 0 0 0 -40 0 v44 a10 10 0 0 0 20 0 v-38"
          fill="none" stroke="#9a9a9a" strokeWidth={6} strokeLinecap="round" />
        <path d="M32 12 v46 a14 14 0 0 0 28 0 v-40 a20 20 0 0 0 -40 0 v44 a10 10 0 0 0 20 0 v-38"
          fill="none" stroke="#c9c9c9" strokeWidth={2.4} strokeLinecap="round" />
      </svg>
      <div style={{ width: 230, height: 168 }}>
        <MiniProduct />
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontFamily: FONT_MONO, fontSize: 15, color: "#5b5343" }}>
        exhibit A
      </div>
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Folder slam
  const slam = spring({ frame, fps, config: { damping: 13, stiffness: 200, mass: 0.9 } });
  const fy = interpolate(slam, [0, 1], [-680, 0]);
  const fscale = interpolate(slam, [0, 1], [1.16, 1]);
  const impact = frame >= 8 && frame < 15 ? Math.sin((frame - 8) * 3.1) * (3 * (1 - (frame - 8) / 7)) : 0;

  return (
    <Paper brackets>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: 1420,
            height: 812,
            transform: `translateY(${fy}px) translateY(${impact}px) scale(${fscale})`,
          }}
        >
          {/* folder tab */}
          <div style={{ position: "absolute", top: -46, left: 70, width: 320, height: 60, background: MANILA, borderTopLeftRadius: 18, borderTopRightRadius: 40, borderBottom: "none", boxShadow: "0 -2px 0 rgba(0,0,0,0.08) inset" }}>
            <div style={{ padding: "14px 0 0 24px", fontFamily: FONT_MONO, fontSize: 20, letterSpacing: 3, color: "#6b5f45" }}>CASE FILE</div>
          </div>
          {/* folder body */}
          <div
            style={{
              width: "100%",
              height: "100%",
              background: MANILA,
              borderRadius: 20,
              boxShadow: "18px 24px 40px rgba(0,0,0,0.30)",
              border: `2px solid ${MANILA_EDGE}`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* inner ruled paper */}
            <div style={{ position: "absolute", inset: 34, background: "#FFFEF6", borderRadius: 8, boxShadow: "inset 0 0 0 1px #EAE3CF", }} />
            {/* header */}
            <div style={{ position: "absolute", top: 70, left: 84, fontFamily: FONT_MONO, fontSize: 24, letterSpacing: 10, color: "#8a7c5c" }}>
              LAUNCHREEL · CONFIDENTIAL
            </div>
            <div style={{ position: "absolute", top: 108, left: 82, fontFamily: FONT_DISPLAY, fontSize: 96, color: INK, letterSpacing: -1 }}>
              CREW DOSSIER
            </div>
            <div style={{ position: "absolute", top: 226, left: 86, right: 86, height: 3, background: "#D8CFB4" }} />
            {/* redaction bars for texture */}
            <div style={{ position: "absolute", top: 268, left: 86, width: 520, height: 22, background: INK, opacity: 0.85, borderRadius: 3 }} />
            <div style={{ position: "absolute", top: 306, left: 86, width: 360, height: 22, background: INK, opacity: 0.85, borderRadius: 3 }} />
            <div style={{ position: "absolute", top: 344, left: 86, width: 440, height: 22, background: INK, opacity: 0.85, borderRadius: 3 }} />
            <div style={{ position: "absolute", bottom: 70, left: 86, fontFamily: FONT_MONO, fontSize: 20, letterSpacing: 4, color: "#9a8c6a" }}>
              FIVE SPECIALISTS · ONE JOB
            </div>
          </div>
          <Polaroid appearAt={22} />
          {/* Stamps land on the dossier */}
          <Stamp label="JOB #0147" sub="THE LEDGERLY LAUNCH" appearAt={20} x={760} y={470} rotate={-7} color={INK} scale={1.15} />
          <Stamp label="DEADLINE: TONIGHT" appearAt={44} x={520} y={640} rotate={6} color={STAMP_RED} scale={1} />
        </div>
      </AbsoluteFill>
    </Paper>
  );
};
