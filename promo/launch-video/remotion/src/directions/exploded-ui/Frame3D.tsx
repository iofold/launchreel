import React from "react";
import { COLORS, MONO, GROTESK, FW, FH } from "./theme";
import { LAYERS, LayerDef } from "./layers";

export type Camera = {
  yaw: number;
  pitch: number;
  dolly: number;
  persp: number;
  originY: number;
  shiftX: number;
  shiftY: number;
};

type Snap = { dx: number; dy: number; k: number };

type Props = {
  camera: Camera;
  amt: (l: LayerDef, i: number) => number; // 0 assembled .. 1 exploded
  reveal: (l: LayerDef, i: number) => number; // content opacity for hidden layers
  chip: (l: LayerDef, i: number) => number; // callout opacity 0..1
  blur?: number;
  emphasize?: (l: LayerDef, i: number) => number; // 0..1 crew-assembly ring
  snap?: (l: LayerDef, i: number) => Snap; // assembly pull toward a crew station
  peel?: number; // watermark peel 0..1
};

const PUSH_X = 0.52;
const PUSH_Y = 0.34;

export const Frame3D: React.FC<Props> = ({ camera, amt, reveal, chip, blur = 0, emphasize, snap, peel = 0 }) => {
  return (
    <div style={{ position: "absolute", inset: 0, perspective: camera.persp, perspectiveOrigin: `50% ${camera.originY}%` }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `translate3d(${camera.shiftX}px, ${camera.shiftY}px, ${camera.dolly}px) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg)`,
        }}
      >
        {/* frame box centered on rig origin */}
        <div style={{ position: "absolute", left: -FW / 2, top: -FH / 2, width: FW, height: FH, transformStyle: "preserve-3d" }}>
          {LAYERS.map((l, i) => {
            const a = amt(l, i);
            const rv = reveal(l, i);
            const cop = chip(l, i);
            const s = snap ? snap(l, i) : { dx: 0, dy: 0, k: 0 };
            const em = emphasize ? emphasize(l, i) : 0;
            const isWM = l.id === "watermark";

            const cx = l.home.x + l.home.w / 2 - FW / 2;
            const cy = l.home.y + l.home.h / 2 - FH / 2;
            const pushX = cx * PUSH_X * a + s.dx * s.k;
            const pushY = cy * PUSH_Y * a + s.dy * s.k - (isWM ? peel * 240 : 0);
            const z = l.z * a + (isWM ? peel * 300 : 0);
            const edge = Math.min(1, a * 1.5);
            const contentOp = l.hero ? 1 : rv;
            const layerOp = isWM ? 1 - peel * 0.9 : 1;

            return (
              <div
                key={l.id}
                style={{
                  position: "absolute",
                  left: l.home.x,
                  top: l.home.y,
                  width: l.home.w,
                  height: l.home.h,
                  transformStyle: "preserve-3d",
                  transform: `translate3d(${pushX}px, ${pushY}px, ${z}px) scale(${1 + em * 0.05})`,
                  opacity: layerOp,
                  filter: blur > 0 ? `blur(${blur}px)` : undefined,
                }}
              >
                {/* crew-assembly ring */}
                {em > 0.02 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: -14,
                      borderRadius: 16,
                      border: `3px solid ${l.color}`,
                      boxShadow: `0 0 ${26 * em}px ${l.color}`,
                      opacity: em,
                    }}
                  />
                )}
                {/* frosted part-panel (only when exploded) */}
                {l.panel && edge > 0.05 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: -10,
                      borderRadius: 14,
                      background: `rgba(28,23,14,${0.55 * edge})`,
                      border: `1px solid rgba(255,243,214,${0.16 * edge})`,
                    }}
                  />
                )}
                {/* the part */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: contentOp,
                    borderRadius: isWM || l.id === "bg" ? 20 : 10,
                    boxShadow: edge > 0.05 && !isWM ? `0 ${16 * edge}px ${34 * edge}px rgba(6,4,2,${0.42 * edge})` : undefined,
                  }}
                >
                  {l.content}
                </div>
                {cop > 0.01 && <Callout l={l} op={cop} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Callout: React.FC<{ l: LayerDef; op: number }> = ({ l, op }) => {
  const right = l.side === "R";
  const gap = 40;
  const chipW = 172;
  const anchorY = Math.min(l.home.h / 2, 26);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: op }}>
      <div style={{ position: "absolute", top: anchorY - 4, [right ? "right" : "left"]: -2, width: 8, height: 8, borderRadius: "50%", background: l.color, border: `2px solid ${COLORS.ink}` }} />
      <div style={{ position: "absolute", top: anchorY, [right ? "right" : "left"]: -gap, width: gap, height: 2, background: COLORS.ink }} />
      <div
        style={{
          position: "absolute",
          top: anchorY - 21,
          [right ? "right" : "left"]: -(gap + chipW),
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
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: COLORS.paper, background: l.color, padding: "1px 5px", borderRadius: 4, border: `1.5px solid ${COLORS.ink}` }}>{l.tag}</span>
          <span style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 15, color: COLORS.ink }}>{l.title}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#6b6252", marginTop: 2 }}>{l.sub}</div>
      </div>
    </div>
  );
};
