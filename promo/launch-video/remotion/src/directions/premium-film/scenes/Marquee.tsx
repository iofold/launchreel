import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { COLORS } from "../../../lib/brand";
import { breathe, FilmGrain, TextScrim, Vignette } from "../lib/effects";
import { FONT } from "../lib/type";
import { CineLine } from "../components";

// 18–24s · MARQUEE (Veo #3) — bulbs light up around a blank sign. Remotion
// tracks "YOUR NAME HERE." onto the sign panel (locked-off camera, fixed region).
export const Marquee: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const scale = breathe(frame, duration, 1.03, 1.07);

  // sign lettering flickers to life once the bulbs are lit (~2.3s in)
  const reveal = interpolate(frame, [70, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flick = frame < 104 ? 0.88 + 0.12 * Math.sin(frame * 2.3) : 1;
  const signOpacity = reveal * flick;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={staticFile("gen/premium-film/shot3-marquee.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <FilmGrain opacity={0.09} id="grain-marquee" />
      <Vignette strength={0.42} />

      {/* YOUR NAME HERE — tracked to the sign panel center (~58.5%, 48.5%) */}
      <div
        style={{
          position: "absolute",
          left: "58.3%",
          top: "51%",
          transform: "translate(-50%,-50%)",
          width: "52%",
          textAlign: "center",
          opacity: signOpacity,
          fontFamily: FONT.roman,
          fontSize: 66,
          fontWeight: 400,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#20160C",
          textShadow: "0 1px 2px rgba(120,80,20,0.25)",
          lineHeight: 1,
        }}
      >
        Your name here.
      </div>

      {/* sound-off reinforcement, low and quiet */}
      <TextScrim cx="50%" cy="88%" rx="40%" ry="14%" strength={0.5} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 66 }}>
        <CineLine
          frame={frame}
          start={112}
          style={{ color: COLORS.cream, fontSize: 34, fontStyle: "italic" }}
        >
          Your launch, in lights.
        </CineLine>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
