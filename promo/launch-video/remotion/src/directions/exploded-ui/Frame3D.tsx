import React from "react";
import { COLORS, MONO, GROTESK, FW, FH } from "./theme";
import { LAYERS, LayerDef } from "./layers";

export type Camera = {
  yaw: number; // deg, rotateY of the whole rig
  pitch: number; // deg, rotateX
  dolly: number; // px, translateZ of the rig (— = further)
  persp: number; // px, perspective
  originY: number; // % vertical perspective origin
};

type Props = {
  camera: Camera;
  // per-layer explosion 0 (assembled) .. 1 (fully separated)
  amt: (l: LayerDef, i: number) => number;
  // opacity of a layer's own content (hidden layers fade in on explode)
  reveal: (l: LayerDef, i: number) => number;
  // chip / leader-line opacity 0..1
  chip: (l: LayerDef, i: number) => number;
  // isotropic motion-blur px (implosion)
  blur?: number;
  // crew index being highlighted during assembly (-1 = none)
  highlight?: number;
  // extra pull of a layer toward its crew station during assembly (px, y)
  snap?: (l: LayerDef, i: number) => { dx: number; dy: number; k: number };
  // watermark peel 0..1 (slides watermark sheet off toward camera + up)
  peel?: number;
};

const fanX = (l: LayerDef, i: number) => (l.side === "L" ? -1 : 1) * (14 + i * 1.5);
const fanY = (i: number) => (i - (LAYERS.length - 1) / 2) * 7;

export const Frame3D: React.FC<Props> = ({
  camera,
  amt,
  reveal,
  chip,
  blur = 0,
  highlight = -1,
  snap,
  peel = 0,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        perspective: camera.persp,
        perspectiveOrigin: `50% ${camera.originY}%`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `translateZ(${camera.dolly}px) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg)`,
        }}
      >
        {LAYERS.map((l, i) => {
          const a = amt(l, i);
          const rv = reveal(l, i);
          const cop = chip(l, i);
          const s = snap ? snap(l, i) : { dx: 0, dy: 0, k: 0 };
          const dim = highlight >= 0 && l.crew !== highlight ? 0.32 : 1;
          const isWM = l.id === "watermark";
          const z = l.z * a + (isWM ? peel * 260 : 0);
          const px = fanX(l, i) * a + s.dx * s.k;
          const py = fanY(i) * a + s.dy * s.k - (isWM ? peel * 220 : 0);
          // physical-sheet edge strengthens as it separates
          const edge = Math.min(1, a * 1.4);
          return (
            <div
              key={l.id}
              style={{
                position: "absolute",
                left: -FW / 2,
                top: -FH / 2,
                width: FW,
                height: FH,
                transformStyle: "preserve-3d",
                transform: `translate3d(${px}px, ${py}px, ${z}px)`,
                opacity: dim * (isWM ? 1 - peel * 0.85 : 1),
                filter: blur > 0 ? `blur(${blur}px)` : undefined,
              }}
            >
              {/* the sheet */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 22,
                  opacity: l.hero ? 1 : rv,
                  boxShadow:
                    edge > 0.05
                      ? `0 ${18 * edge}px ${40 * edge}px rgba(10,8,4,${0.28 * edge})`
                      : undefined,
                  outline: edge > 0.05 ? `1px solid rgba(23,19,13,${0.10 * edge})` : undefined,
                }}
              >
                {l.content}
              </div>

              {/* callout: leader line + chip (in-plane, tilts with the sheet) */}
              {cop > 0.01 && (
                <Callout l={l} op={cop} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Callout: React.FC<{ l: LayerDef; op: number }> = ({ l, op }) => {
  const right = l.side === "R";
  const gap = 44;
  const chipW = 176;
  const y = l.chipY;
  // leader line from plane edge outward
  const lineLen = gap;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: op }}>
      {/* anchor dot on the sheet edge */}
      <div
        style={{
          position: "absolute",
          top: y - 4,
          [right ? "right" : "left"]: -2,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: l.color,
          border: `2px solid ${COLORS.ink}`,
        }}
      />
      {/* leader line */}
      <div
        style={{
          position: "absolute",
          top: y,
          [right ? "right" : "left"]: -lineLen,
          width: lineLen,
          height: 2,
          background: COLORS.ink,
        }}
      />
      {/* chip */}
      <div
        style={{
          position: "absolute",
          top: y - 22,
          [right ? "right" : "left"]: -(lineLen + chipW),
          width: chipW,
          background: COLORS.paper,
          border: `2px solid ${COLORS.ink}`,
          borderRadius: 8,
          boxShadow: `3px 3px 0 ${COLORS.ink}`,
          padding: "6px 9px",
          textAlign: right ? "right" : "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: right ? "flex-end" : "flex-start" }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: COLORS.paper,
              background: l.color,
              padding: "1px 5px",
              borderRadius: 4,
              border: `1.5px solid ${COLORS.ink}`,
            }}
          >
            {l.tag}
          </span>
          <span style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 15, color: COLORS.ink }}>{l.title}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#6b6252", marginTop: 2 }}>{l.sub}</div>
      </div>
    </div>
  );
};
