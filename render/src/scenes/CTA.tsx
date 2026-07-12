import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { Wordmark, StickerField, Watermark } from "../components/Deco";
import { popShadow } from "../components/util";
import { readableOn } from "../theme";
import { DISPLAY, BODY } from "../fonts";

/** Scene 6 — CTA: wordmark, URL pill, "claim your trailer" line, optional Veo bed. */
export const CTA: React.FC<SceneProps> = ({ scene, theme, brand, watermark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = spring({ frame, fps, config: { damping: 13 } });
  const urlP = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const btnP = spring({ frame: frame - 18, fps, config: { damping: 12 } });
  const textColor = readableOn(theme.bg, theme.ink, theme.paper);
  const url = brand.url || "";

  return (
    <SceneShell bg={theme.bg} ink={theme.ink} bgVideoPath={scene.bgVideoPath}>
      <StickerField seed={7} />
      {watermark ? <Watermark ink={theme.ink} accent={theme.pop[0]} /> : null}
      <AbsoluteFill style={{ padding: 96, justifyContent: "center", alignItems: "center", gap: 46, textAlign: "center" }}>
        <div style={{ transform: `scale(${interpolate(mark, [0, 1], [0.7, 1])})`, opacity: mark }}>
          <Wordmark name={brand.name} ink={theme.ink} accent={theme.accent} accent2={theme.pop[2]} size={96} />
        </div>

        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 78,
            color: theme.ink,
            letterSpacing: "-0.02em",
            lineHeight: 1.03,
            maxWidth: "90%",
          }}
        >
          {scene.headline || brand.oneLiner}
        </div>

        {url ? (
          <div
            style={{
              transform: `translateY(${interpolate(urlP, [0, 1], [40, 0])}px)`,
              opacity: urlP,
              background: theme.paper,
              border: `5px solid ${theme.ink}`,
              borderRadius: 999,
              padding: "20px 40px",
              fontFamily: DISPLAY,
              fontSize: 46,
              color: theme.accent,
              boxShadow: popShadow(theme.ink, 8),
            }}
          >
            {url}
          </div>
        ) : null}

        <div
          style={{
            transform: `scale(${interpolate(btnP, [0, 1], [0.6, 1])})`,
            opacity: btnP,
            background: theme.pop[0],
            color: readableOn(theme.pop[0], theme.ink, theme.paper),
            border: `5px solid ${theme.ink}`,
            borderRadius: 20,
            padding: "24px 46px",
            fontFamily: DISPLAY,
            fontSize: 52,
            boxShadow: popShadow(theme.ink, 10),
          }}
        >
          {scene.sub || "Claim your trailer →"}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
