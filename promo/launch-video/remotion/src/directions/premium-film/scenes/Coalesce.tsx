import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { COLORS, CREW } from "../../../lib/brand";
import { breathe, FilmGrain, Vignette } from "../lib/effects";
import { CineLine } from "../components";
import { FONT } from "../lib/type";

// 6–12s · COALESCE (Veo #2) — a warm brand light-field gathers into UI cards
// (center-right of frame). Type lives in the open cream space on the left.
export const Coalesce: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const scale = breathe(frame, duration, 1.03, 1.08);

  // crew names ledger in, one by one
  const crewStart = 66;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={staticFile("gen/premium-film/shot2-coalesce.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {/* lift the left third slightly so ink type reads over the bokeh */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(255,251,238,0.55) 0%, rgba(255,251,238,0.12) 34%, rgba(255,251,238,0) 52%)",
        }}
      />
      <FilmGrain opacity={0.06} id="grain-coalesce" />
      <Vignette strength={0.3} />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingLeft: 150,
          paddingRight: 900,
        }}
      >
        <CineLine
          frame={frame}
          start={12}
          style={{
            color: COLORS.ink,
            fontSize: 66,
            fontWeight: 500,
            lineHeight: 1.12,
            textAlign: "left",
          }}
        >
          A crew of five builds
          <br />
          your trailer.
        </CineLine>

        {/* hairline rule */}
        <div
          style={{
            marginTop: 40,
            marginBottom: 34,
            width: interpolate(frame, [crewStart - 6, crewStart + 20], [0, 300], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            height: 1.5,
            background: COLORS.ink,
            opacity: 0.5,
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CREW.map((c, i) => {
            const s = crewStart + i * 12;
            const o = interpolate(frame, [s, s + 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const x = interpolate(o, [0, 1], [-16, 0]);
            return (
              <div
                key={c.name}
                style={{
                  opacity: o,
                  transform: `translateX(${x}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontFamily: FONT.roman,
                  fontSize: 27,
                  letterSpacing: "0.34em",
                  textTransform: "uppercase",
                  color: COLORS.ink,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 9, background: c.color }} />
                {c.name}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
