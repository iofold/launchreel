import React from "react";
import { AbsoluteFill } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { KineticHeadline, StickerField, Wordmark } from "../components/Deco";
import { readableOn } from "../theme";
import { BODY } from "../fonts";

/** Scene 1 — Hook: kinetic typography on brand colors, optional Veo bed underneath. */
export const Hook: React.FC<SceneProps> = ({ scene, theme, brand }) => {
  const headline = scene.headline || brand.oneLiner || brand.name;
  const words = headline.split(" ");
  const hiIndex = words.length - 1;
  const hiFill = theme.pop[1];
  const textColor = readableOn(theme.bg, theme.ink, theme.paper);

  return (
    <SceneShell bg={theme.bg} ink={theme.ink} bgVideoPath={scene.bgVideoPath}>
      <StickerField seed={2} />
      <AbsoluteFill
        style={{
          padding: 96,
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: 44,
        }}
      >
        <Wordmark name={brand.name} ink={theme.ink} accent={theme.accent} accent2={theme.pop[2]} size={58} />
        <KineticHeadline
          text={headline}
          color={theme.ink}
          ink={theme.ink}
          fontSize={132}
          startFrame={6}
          highlightWord={hiIndex}
          highlightFill={hiFill}
          highlightText={readableOn(hiFill, theme.ink, theme.paper)}
        />
        {scene.sub ? (
          <p
            style={{
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 40,
              color: textColor,
              opacity: 0.82,
              maxWidth: "80%",
              margin: 0,
            }}
          >
            {scene.sub}
          </p>
        ) : null}
      </AbsoluteFill>
    </SceneShell>
  );
};
