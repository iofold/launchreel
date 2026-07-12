// GUIDE (528–702f) — the Buildathon-TV program guide fills with premieres;
// the YOURS row slams in highlighted. Offer ticker carries ₹999 + free teaser.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, CHROME } from "../../../lib/brand";
import { ANTON, ARCHIVO, INTER } from "../theme";
import { ChannelBug, Ticker } from "../chrome";

type Row = { n: string; letter: string; color: string; name: string; tag: string; status: string; live?: boolean; you?: boolean };

const ROWS: Row[] = [
  { n: "01", letter: "L", color: COLORS.blue, name: "Ledgerly", tag: "Bookkeeping on autopilot", status: "ON AIR", live: true },
  { n: "02", letter: "S", color: COLORS.green, name: "Sproutbox", tag: "Plants, delivered monthly", status: "NEXT 18:04" },
  { n: "03", letter: "N", color: COLORS.purple, name: "Nimbus", tag: "Wikis that write themselves", status: "NEXT 18:05" },
  { n: "04", letter: "F", color: COLORS.orange, name: "Forkly", tag: "Recipes from your fridge", status: "NEXT 18:06" },
  { n: "05", letter: "P", color: COLORS.pink, name: "PayPigeon", tag: "Invoices that chase themselves", status: "NEXT 18:07" },
  { n: "★", letter: "★", color: COLORS.yellow, name: "YOURS", tag: "Your big launch — the one you built", status: "TONIGHT 21:00", you: true },
];

const GuideRow: React.FC<{ row: Row; appearAt: number; frame: number; fps: number }> = ({ row, appearAt, frame, fps }) => {
  const s = spring({ frame: frame - appearAt, fps, config: { damping: 13, mass: 0.7 }, durationInFrames: 16 });
  const x = interpolate(s, [0, 1], [-70, 0]);
  const op = interpolate(frame - appearAt, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = row.you ? 0.5 + 0.5 * Math.sin((frame - appearAt) / 5) : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        height: row.you ? 128 : 108,
        padding: "0 26px",
        transform: `translateX(${x}px) scale(${row.you ? 1 + 0.02 * pulse : 1})`,
        opacity: op,
        background: row.you ? COLORS.yellow : COLORS.paper,
        border: CHROME.border,
        borderRadius: CHROME.radius,
        boxShadow: row.you ? `${8 + 6 * pulse}px ${8 + 6 * pulse}px 0 ${COLORS.ink}` : CHROME.shadowSm,
      }}
    >
      <div style={{ fontFamily: ANTON, fontSize: 34, color: COLORS.ink, width: 46, textAlign: "center" }}>{row.n}</div>
      <div style={{ width: 74, height: 74, borderRadius: 16, background: row.color, border: CHROME.border, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ARCHIVO, fontSize: 40, color: row.you ? COLORS.ink : COLORS.paper }}>
        {row.letter}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: ARCHIVO, fontSize: 40, color: COLORS.ink, lineHeight: 1 }}>{row.name}</div>
        <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 26, color: "#4a463d" }}>{row.tag}</div>
      </div>
      {row.you ? (
        <div style={{ fontFamily: ARCHIVO, fontSize: 30, color: COLORS.pink, transform: `translateX(${-6 * pulse}px)` }}>◀ THAT&rsquo;S YOU</div>
      ) : null}
      <div
        style={{
          padding: "10px 20px",
          borderRadius: 999,
          background: row.live ? COLORS.pink : row.you ? COLORS.ink : COLORS.sky,
          border: CHROME.border,
          fontFamily: ARCHIVO,
          fontSize: 24,
          color: row.live || row.you ? COLORS.paper : COLORS.ink,
          whiteSpace: "nowrap",
        }}
      >
        {row.live ? "● ON AIR" : row.status}
      </div>
    </div>
  );
};

export const Guide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headIn = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.cream }}>
      {/* header */}
      <div style={{ position: "absolute", top: 40, left: 56, right: 56, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: headIn, transform: `translateY(${(1 - headIn) * -16}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ padding: "8px 18px 6px", background: COLORS.ink, borderRadius: 10, fontFamily: ARCHIVO, fontSize: 24, letterSpacing: 3, color: COLORS.yellow }}>
            LIVE AT THE EVENT
          </div>
          <div style={{ fontFamily: ANTON, fontSize: 56, color: COLORS.ink, letterSpacing: 1 }}>TONIGHT ON BUILDATHON TV 📺</div>
        </div>
      </div>

      <AbsoluteFill style={{ justifyContent: "center", padding: "0 56px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
          {ROWS.map((r, i) => (
            <GuideRow key={r.name} row={r} appearAt={10 + i * 9 + (r.you ? 12 : 0)} frame={frame} fps={fps} />
          ))}
        </div>
      </AbsoluteFill>

      <ChannelBug n="✦" tint={COLORS.yellow} />

      <Ticker
        tag="TONIGHT"
        tagColor={COLORS.blue}
        items={["FREE TEASER", "₹999 FULL TRAILER", "paste your URL at launchreel.xyz", "every launch premieres here"]}
        speed={5}
      />
    </AbsoluteFill>
  );
};
