// INTAKE — the intake form rebuilt natively from full-intake.png. A cursor fills the
// product name + website, selects the ₹999 tier, and slams "Make my trailer".
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, CHROME } from "../../../lib/brand";
import { UI } from "../fonts";
import { TopNav, Eyebrow, INK, card } from "../ui";
import { Cursor } from "../Cursor";
import {
  COL_R,
  COL_W,
  F,
  FIELD_H,
  TIER,
  BTN,
  PRODUCT_TEXT,
  WEBSITE_TEXT,
  PRODUCT_FRAMES,
  WEBSITE_FRAMES,
  CLICK_PRODUCT,
  CLICK_WEBSITE,
  CLICK_TIER,
  SLAM_BUTTON,
} from "../intakeShared";

const shown = (frames: number[], f: number) => frames.filter((x) => x <= f).length;

const Label: React.FC<{ y: number; children: React.ReactNode; sub?: string }> = ({ y, children, sub }) => (
  <div style={{ position: "absolute", left: COL_R, top: y - 34, fontFamily: UI, color: INK }}>
    <span style={{ fontWeight: 800, fontSize: 23 }}>{children}</span>
    {sub && <span style={{ fontWeight: 600, fontSize: 18, opacity: 0.6, marginLeft: 8 }}>{sub}</span>}
  </div>
);

const Field: React.FC<{
  y: number;
  value: string;
  placeholder: string;
  focused: boolean;
  caretOn: boolean;
}> = ({ y, value, placeholder, focused, caretOn }) => (
  <div
    style={{
      position: "absolute",
      left: COL_R,
      top: y,
      width: COL_W,
      height: FIELD_H,
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      boxSizing: "border-box",
      background: COLORS.paper,
      border: `3px solid ${INK}`,
      borderRadius: 12,
      boxShadow: focused ? `0 0 0 4px ${COLORS.yellow}` : "none",
      fontFamily: UI,
      fontSize: 25,
    }}
  >
    {value ? (
      <span style={{ color: INK, fontWeight: 700 }}>{value}</span>
    ) : (
      <span style={{ color: "#9a9082", fontWeight: 500 }}>{placeholder}</span>
    )}
    {focused && caretOn && (
      <span style={{ display: "inline-block", width: 3, height: 30, background: INK, marginLeft: 2 }} />
    )}
  </div>
);

const Tier: React.FC<{
  y: number;
  name: string;
  price: string;
  detail: string;
  selected: boolean;
  pop: number;
}> = ({ y, name, price, detail, selected, pop }) => (
  <div
    style={{
      position: "absolute",
      left: COL_R,
      top: y,
      width: COL_W,
      height: TIER.h,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 22px",
      background: selected ? COLORS.yellow : COLORS.paper,
      border: `3px solid ${INK}`,
      borderRadius: 14,
      boxShadow: selected ? `6px 6px 0 ${INK}` : `3px 3px 0 ${INK}`,
      transform: `scale(${selected ? pop : 1})`,
      fontFamily: UI,
    }}
  >
    <div>
      <div style={{ fontWeight: 900, fontSize: 24, color: INK }}>{name}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color: INK, opacity: 0.75 }}>{detail}</div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontWeight: 900, fontSize: 26, color: INK }}>{price}</div>
      {selected && (
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: COLORS.green,
            border: `3px solid ${INK}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: INK,
            fontWeight: 900,
            fontSize: 20,
            transform: `scale(${pop})`,
          }}
        >
          ✓
        </div>
      )}
    </div>
  </div>
);

const Dropzone: React.FC<{ top: number; height: number; fill: string; emoji: string; title: string; sub: string }> = ({
  top,
  height,
  fill,
  emoji,
  title,
  sub,
}) => (
  <div
    style={{
      position: "absolute",
      left: 26,
      top,
      right: 26,
      height,
      background: fill,
      border: `3px dashed ${INK}`,
      borderRadius: 14,
      padding: 22,
      boxSizing: "border-box",
      fontFamily: UI,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 30 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 22, color: INK }}>{title}</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: INK, opacity: 0.7 }}>{sub}</div>
      </div>
    </div>
    <div
      style={{
        width: 56,
        height: 56,
        marginTop: 18,
        border: `3px dashed ${INK}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 34,
        color: INK,
        fontWeight: 700,
      }}
    >
      +
    </div>
  </div>
);

export const Intake: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.6 } });
  const rise = interpolate(enter, [0, 1], [40, 0]);

  const productVal = PRODUCT_TEXT.slice(0, shown(PRODUCT_FRAMES, frame));
  const websiteVal = WEBSITE_TEXT.slice(0, shown(WEBSITE_FRAMES, frame));

  const productFocused = frame >= CLICK_PRODUCT && frame < CLICK_WEBSITE;
  const websiteFocused = frame >= CLICK_WEBSITE && frame < CLICK_TIER;
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  const tierSelected = frame >= CLICK_TIER;
  const tierPop = tierSelected
    ? interpolate(spring({ frame: frame - CLICK_TIER, fps, config: { damping: 9, mass: 0.6 } }), [0, 1], [1.08, 1])
    : 1;

  // button slam: press toward its shadow then bounce back
  const sinceSlam = frame - SLAM_BUTTON;
  const pressT = sinceSlam >= 0 ? Math.exp(-sinceSlam / 4) * Math.max(0, 1 - sinceSlam / 14) : 0;
  const btnDx = pressT * 6;
  const btnShadow = 6 - pressT * 6;

  // Let the slam + selection land clean, then a fast punch-flash into the job board.
  const flash = interpolate(frame, [176, 183, 189], [0, 0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: COLORS.cream, fontFamily: UI }}>
      <TopNav active="Intake" />

      <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translateY(${rise}px)` }}>
        {/* LEFT column */}
        <div style={{ position: "absolute", left: 72, top: 108 }}>
          <Eyebrow>NEW ORDER</Eyebrow>
        </div>
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 150,
            fontWeight: 900,
            fontSize: 62,
            lineHeight: 1.02,
            color: INK,
            width: 720,
          }}
        >
          Let's make your
          <br />
          launch trailer 🎬
        </div>
        <div style={{ position: "absolute", left: 72, top: 300, width: 640, fontWeight: 600, fontSize: 22, lineHeight: 1.35, color: INK }}>
          Drop your logo + a few screenshots. Our little crew turns them into a branded 30-second trailer with voiceover — in minutes.
        </div>

        {/* dropzone card */}
        <div style={{ position: "absolute", left: 72, top: 430, width: 760, height: 500, ...card() }}>
          <Dropzone top={20} height={220} fill={COLORS.sky} emoji="🏷️" title="Your logo" sub="Tap to drop it in (SVG / PNG)" />
          <Dropzone top={262} height={216} fill={COLORS.paper} emoji="🖼️" title="Screenshots · up to 6" sub="Tap to add product shots" />
        </div>

        {/* RIGHT column — form */}
        <Label y={F.product}>Product name</Label>
        <Field y={F.product} value={productVal} placeholder="e.g. Ledgerly" focused={productFocused} caretOn={caretOn} />

        <Label y={F.oneliner}>One-liner</Label>
        <Field y={F.oneliner} value="" placeholder="e.g. Bookkeeping on autopilot" focused={false} caretOn={false} />

        <Label y={F.email} sub="(we send the reel here)">Email</Label>
        <Field y={F.email} value="" placeholder="founder@yourstartup.com" focused={false} caretOn={false} />

        <Label y={F.website} sub="(optional — Scout will snoop 🔍)">Website</Label>
        <Field y={F.website} value={websiteVal} placeholder="yourstartup.com" focused={websiteFocused} caretOn={caretOn} />

        <div style={{ position: "absolute", left: COL_R, top: TIER.free - 44, fontWeight: 900, fontSize: 26, color: INK }}>
          Pick a tier
        </div>
        <Tier y={TIER.free} name="Free teaser" price="₹0" detail="~10-sec watermarked teaser" selected={false} pop={1} />
        <Tier y={TIER.launch} name="Launch Trailer" price="₹999" detail="Polished 30-sec · clean export · premiere page" selected={tierSelected} pop={tierPop} />
        <Tier y={TIER.pack} name="Content Pack" price="₹2,999" detail="Trailer + 3 posts + OG images" selected={false} pop={1} />

        {/* Make my trailer button */}
        <div
          style={{
            position: "absolute",
            left: COL_R,
            top: BTN.y,
            width: COL_W,
            height: BTN.h,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: COLORS.blue,
            color: COLORS.paper,
            border: `3px solid ${INK}`,
            borderRadius: 16,
            boxShadow: `${btnShadow}px ${btnShadow}px 0 ${INK}`,
            transform: `translate(${btnDx}px, ${btnDx}px)`,
            fontWeight: 900,
            fontSize: 30,
          }}
        >
          🚀 Make my trailer
        </div>
      </div>

      <Cursor />

      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
