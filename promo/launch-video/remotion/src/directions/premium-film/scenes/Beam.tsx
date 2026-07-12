import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { breathe, FilmGrain, TextScrim, Vignette } from "../lib/effects";
import { CineLine } from "../components";

// 0–6s · THE BEAM (Veo #1) — darkness, a projector beam through drifting dust.
// Hook type: "Some products get a post." → "Yours gets a premiere."
export const Beam: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const scale = breathe(frame, duration, 1.04, 1.11);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={staticFile("gen/premium-film/shot1-beam.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <FilmGrain opacity={0.1} id="grain-beam" />
      <Vignette strength={0.62} />

      {/* hook type sits low, in the darkest part of the frame, over a soft scrim */}
      <TextScrim cx="50%" cy="70%" rx="46%" ry="24%" strength={0.55} />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 210,
          textAlign: "center",
        }}
      >
        <CineLine
          frame={frame}
          start={16}
          outStart={84}
          style={{ color: "#EFE4CC", fontSize: 60, fontWeight: 400, fontStyle: "italic" }}
        >
          Some products get a post.
        </CineLine>
        <CineLine
          frame={frame}
          start={98}
          style={{
            color: "#FFF3D6",
            fontSize: 74,
            fontWeight: 500,
            textShadow: "0 2px 30px rgba(0,0,0,0.55)",
          }}
        >
          Yours gets a premiere.
        </CineLine>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
