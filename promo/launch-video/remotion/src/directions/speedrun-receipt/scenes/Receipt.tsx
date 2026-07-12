// THE RECEIPT (24–30s) — a dot-matrix receipt prints downward, tears off, and lands as
// the on-brand end-card: wordmark + launchreel.xyz + free-teaser + real QR + ₹999 anchor.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../../../lib/brand";
import { DOT, MONEY, UI } from "../fonts";
import { Wordmark } from "../ui";
import { QR_MATRIX, QR_SIZE } from "../qr";
import { TEAR_LOCAL } from "../receiptTiming";

const INK = COLORS.ink;
const PAPER_W = 660;
const PAPER_X = (1920 - PAPER_W) / 2;
const TOP = 78;
const TEAR = TEAR_LOCAL; // local frame the receipt tears free

const QR: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} style={{ background: "#fff", display: "block" }}>
    {QR_MATRIX.map((row, y) =>
      row.map((v, x) => (v ? <rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} fill={INK} /> : null)),
    )}
  </svg>
);

// A printed line that reveals with a tiny ink-flicker + jitter, like a print head pass.
const Line: React.FC<{ t: number; frame: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  t,
  frame,
  children,
  style,
}) => {
  if (frame < t) return null;
  const age = frame - t;
  const op = interpolate(age, [0, 3], [0.35, 1], { extrapolateRight: "clamp" });
  const jx = age < 3 ? (age % 2 === 0 ? 0.8 : -0.8) : 0;
  return <div style={{ opacity: op, transform: `translateX(${jx}px)`, ...style }}>{children}</div>;
};

const Row: React.FC<{ t: number; frame: number; label: React.ReactNode; value: React.ReactNode; bold?: boolean }> = ({
  t,
  frame,
  label,
  value,
  bold,
}) => (
  <Line t={t} frame={frame}>
    <div style={{ display: "flex", alignItems: "flex-end", fontSize: bold ? 34 : 30, lineHeight: 1.15, color: INK }}>
      <span style={{ fontFamily: DOT, whiteSpace: "nowrap", fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `2px dotted ${INK}`, margin: "0 8px 8px" }} />
      <span style={{ fontFamily: MONEY, fontWeight: bold ? 900 : 700, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  </Line>
);

const Rule: React.FC<{ t: number; frame: number; double?: boolean }> = ({ t, frame, double }) => (
  <Line t={t} frame={frame} style={{ margin: "6px 0" }}>
    <div style={{ borderTop: `${double ? 4 : 2}px ${double ? "double" : "dashed"} ${INK}`, height: double ? 6 : 0 }} />
  </Line>
);

export const Receipt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  // tear-off: printer feed detaches; receipt settles with a spring + tiny rock.
  const torn = frame >= TEAR;
  const settle = spring({ frame: frame - TEAR, fps, config: { damping: 12, mass: 0.9 } });
  const paperY = torn ? interpolate(settle, [0, 1], [0, 26]) : 0; // slight drop as it tears free
  const rock = torn ? (1 - settle) * Math.sin((frame - TEAR) * 0.6) * 1.4 : 0;
  const slotY = torn ? interpolate(settle, [0, 1], [0, -160]) : 0;
  const slotOp = torn ? 1 - settle : 1;

  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: UI, opacity: fadeIn }}>
      {/* radial glow behind receipt */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(closest-side at 50% 46%, ${COLORS.yellow}55, transparent 72%)`,
        }}
      />

      {/* printer feed slot (detaches on tear) */}
      <div
        style={{
          position: "absolute",
          left: PAPER_X - 30,
          top: TOP - 34 + slotY,
          width: PAPER_W + 60,
          height: 34,
          background: INK,
          borderRadius: 8,
          opacity: slotOp,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.yellow,
          fontWeight: 900,
          fontSize: 15,
          letterSpacing: 3,
        }}
      >
        ▂▂▂ LAUNCHREEL THERMAL ▂▂▂
      </div>

      {/* the receipt */}
      <div
        style={{
          position: "absolute",
          left: PAPER_X,
          top: TOP + paperY,
          width: PAPER_W,
          transform: `rotate(${rock}deg)`,
          transformOrigin: "top center",
          background: COLORS.paper,
          border: `3px solid ${INK}`,
          boxShadow: `10px 12px 0 ${INK}`,
          padding: "26px 34px 30px",
          boxSizing: "border-box",
        }}
      >
        {/* header */}
        <Line t={4} frame={frame}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <Wordmark size={30} />
          </div>
          <div style={{ textAlign: "center", fontFamily: DOT, fontSize: 30, letterSpacing: 6, color: INK }}>
            ★ R E C E I P T ★
          </div>
        </Line>
        <Line t={10} frame={frame}>
          <div style={{ textAlign: "center", fontFamily: DOT, fontSize: 24, color: INK, opacity: 0.8, marginBottom: 4 }}>
            ORDER #LR-0047 · 12 JUL
          </div>
        </Line>

        <Rule t={14} frame={frame} />
        <Row t={18} frame={frame} label="1× LAUNCH TRAILER" value="₹999" bold />
        <Row t={22} frame={frame} label="VO + MUSIC" value="incl." />
        <Row t={26} frame={frame} label="PREMIERE PAGE" value="incl." />
        <Row t={30} frame={frame} label="BUILDATHON TV" value="incl." />
        <Rule t={34} frame={frame} />
        <Row t={38} frame={frame} label="YOUR STANDUP COSTS MORE" value="✓" />
        <Row t={44} frame={frame} label="DELIVERED IN" value="00:47.21" />
        <Rule t={50} frame={frame} />
        <Row t={54} frame={frame} label="TOTAL" value="₹999" bold />
        <Rule t={60} frame={frame} double />

        {/* CTA block */}
        <Line t={66} frame={frame}>
          <div style={{ textAlign: "center", fontFamily: DOT, fontSize: 28, color: COLORS.pink, marginTop: 8, marginBottom: 10, fontWeight: 700 }}>
            ★ FREE TEASER — PASTE YOUR URL
          </div>
        </Line>
        <Line t={72} frame={frame}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, justifyContent: "center", margin: "6px 0 10px" }}>
            <div style={{ border: `3px solid ${INK}`, padding: 6, background: "#fff" }}>
              <QR size={124} />
            </div>
            <div>
              <div style={{ fontFamily: DOT, fontSize: 24, color: INK, opacity: 0.7 }}>scan or type</div>
              <div style={{ fontFamily: UI, fontWeight: 900, fontSize: 34, color: INK }}>launchreel.xyz</div>
              <div style={{ fontFamily: DOT, fontSize: 22, color: INK, opacity: 0.7, marginTop: 2 }}>paste a URL → free reel</div>
            </div>
          </div>
        </Line>
        <Rule t={80} frame={frame} />
        <Line t={84} frame={frame}>
          <div style={{ textAlign: "center", fontFamily: DOT, fontSize: 22, color: INK, opacity: 0.75, lineHeight: 1.2 }}>
            BUILT AT THE GROWTHX × HERMES BUILDATHON
            <br />
            ~~~~~~~~~ ✂ tear off here ~~~~~~~~~
          </div>
        </Line>
      </div>
    </AbsoluteFill>
  );
};
