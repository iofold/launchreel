import React from "react";
import { Img } from "remotion";
import { BODY } from "../fonts";
import { popShadow } from "./util";

/**
 * A browser-window frame around a REAL product screenshot. Supports a ken-burns
 * push: `t` (0..1) drives scale from zoomFrom→zoomTo with transform-origin at
 * (focusX, focusY) in %, so a scene can zoom toward a callout. Text stays sharp —
 * this is Remotion compositing a real PNG, never gen-video.
 */
export const DeviceFrame: React.FC<{
  src: string;
  url?: string;
  ink: string;
  accent: string;
  paper: string;
  width: number;
  height: number;
  t?: number; // 0..1 ken-burns progress
  zoomFrom?: number;
  zoomTo?: number;
  focusX?: number; // %
  focusY?: number; // %
  radius?: number;
  children?: React.ReactNode;
}> = ({
  src,
  url,
  ink,
  accent,
  paper,
  width,
  height,
  t = 0,
  zoomFrom = 1,
  zoomTo = 1,
  focusX = 50,
  focusY = 50,
  radius = 26,
  children,
}) => {
  const scale = zoomFrom + (zoomTo - zoomFrom) * t;
  const barH = Math.round(height * 0.11);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        border: `5px solid ${ink}`,
        boxShadow: popShadow(ink, 12),
        background: paper,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* browser chrome */}
      <div
        style={{
          height: barH,
          background: paper,
          borderBottom: `4px solid ${ink}`,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: `0 ${Math.round(barH * 0.5)}px`,
          flex: "0 0 auto",
        }}
      >
        <Dot ink={ink} c="#FF5F57" s={barH * 0.28} />
        <Dot ink={ink} c="#FEBC2E" s={barH * 0.28} />
        <Dot ink={ink} c="#28C840" s={barH * 0.28} />
        <div
          style={{
            marginLeft: 12,
            flex: 1,
            height: barH * 0.52,
            background: "#fff",
            border: `3px solid ${ink}`,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            padding: `0 ${barH * 0.28}px`,
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: barH * 0.3,
            color: ink,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: accent, marginRight: 8 }}>🔒</span>
          {url || ""}
        </div>
      </div>
      {/* screenshot + overlays */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <Img
          src={src}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `${focusX}% ${focusY}%`,
            transform: `scale(${scale})`,
            transformOrigin: `${focusX}% ${focusY}%`,
          }}
        />
        {children}
      </div>
    </div>
  );
};

const Dot: React.FC<{ ink: string; c: string; s: number }> = ({ ink, c, s }) => (
  <span
    style={{
      width: s,
      height: s,
      borderRadius: "50%",
      background: c,
      border: `2px solid ${ink}`,
      display: "block",
      flex: "0 0 auto",
    }}
  />
);
