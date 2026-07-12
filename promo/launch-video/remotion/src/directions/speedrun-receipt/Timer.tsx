// Always-on speedrun HUD, top-right. Ticks from frame 0, shows the ×8 fast-forward
// chip during the crew montage, freezes and stamps a personal best at delivery.
import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from "remotion";
import { COLORS } from "../../lib/brand";
import { MONO, UI } from "./fonts";
import { speedrunCentis, fmtTimer, TL } from "./timer";

const INK = COLORS.ink;

export const TimerHUD: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frozen = frame >= TL.delivery.from;
  const value = fmtTimer(speedrunCentis(frame));

  // Fast-forward chip visible only during the crew montage.
  const ffIn = interpolate(frame, [TL.crew.from, TL.crew.from + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ffOut = interpolate(frame, [TL.crew.from + TL.crew.dur - 10, TL.crew.from + TL.crew.dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ffOpacity = Math.min(ffIn, ffOut);

  // PB stamp pop at freeze.
  const pbPop = spring({ frame: frame - TL.delivery.from, fps, config: { damping: 9, mass: 0.7 } });
  const freezePulse = frozen ? 1 + 0.05 * Math.max(0, Math.sin((frame - TL.delivery.from) * 0.5)) * Math.exp(-(frame - TL.delivery.from) / 12) : 1;

  return (
    <div
      style={{
        position: "absolute",
        top: 92,
        right: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        transform: `scale(${freezePulse})`,
        transformOrigin: "top right",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: frozen ? COLORS.yellow : COLORS.paper,
          border: `4px solid ${INK}`,
          boxShadow: `5px 5px 0 ${INK}`,
          borderRadius: 14,
          padding: "10px 18px",
        }}
      >
        {frozen && (
          <div
            style={{
              transform: `scale(${pbPop})`,
              background: COLORS.green,
              color: INK,
              fontFamily: UI,
              fontWeight: 900,
              fontSize: 24,
              padding: "3px 12px",
              borderRadius: 9,
              border: `3px solid ${INK}`,
              letterSpacing: 0.5,
            }}
          >
            PB!
          </div>
        )}
        {!frozen && (
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: 999,
              background: COLORS.pink,
              border: `2.5px solid ${INK}`,
              opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.4)),
            }}
          />
        )}
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: 50,
            color: INK,
            letterSpacing: 1,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      </div>

      {ffOpacity > 0.01 && (
        <div
          style={{
            opacity: ffOpacity,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: COLORS.pink,
            color: COLORS.paper,
            border: `3px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
            borderRadius: 10,
            padding: "5px 12px",
            fontFamily: UI,
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: 0.5,
          }}
        >
          ⏩ ×8 SPEED
        </div>
      )}
    </div>
  );
};
