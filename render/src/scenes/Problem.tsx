import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { KineticHeadline, StickerField } from "../components/Deco";
import { asset, popShadow } from "../components/util";
import { readableOn } from "../theme";
import { BODY } from "../fonts";

/**
 * Scene 2 — Problem: a desaturated still with a slow pan/mask + a one-line problem
 * caption. Degrades to a moody solid field when no screenshot is provided.
 */
export const Problem: React.FC<SceneProps> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const shot = asset(scene.screenshotPaths[0]);
  const t = frame / durationInFrames;
  const pan = interpolate(t, [0, 1], [0, -6]); // slow drift %
  const scale = interpolate(t, [0, 1], [1.12, 1.22]);
  const reveal = interpolate(frame, [4, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const headline = scene.headline || "The old way doesn't scale.";
  const words = headline.split(" ");

  return (
    <SceneShell bg={theme.ink} ink={theme.ink} entrance>
      {shot ? (
        <AbsoluteFill>
          <Img
            src={shot}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${50 + pan}% 30%`,
              transform: `scale(${scale})`,
              filter: "grayscale(1) contrast(0.9) brightness(0.62)",
            }}
          />
          {/* accent wash + vignette mask */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, ${theme.ink}CC 0%, ${theme.pop[0]}33 55%, ${theme.ink}EE 100%)`,
              mixBlendMode: "multiply",
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: theme.ink }}>
          <StickerField seed={9} emojis={["😵‍💫", "🗂️", "⏳", "📉"]} />
        </AbsoluteFill>
      )}

      <AbsoluteFill
        style={{
          padding: 100,
          justifyContent: "flex-end",
          alignItems: "flex-start",
          paddingBottom: 200,
        }}
      >
        <div
          style={{
            opacity: reveal,
            transform: `translateY(${interpolate(reveal, [0, 1], [30, 0])}px)`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              background: theme.pop[0],
              color: readableOn(theme.pop[0], theme.ink, theme.paper),
              fontFamily: BODY,
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "8px 16px",
              border: `4px solid ${theme.paper}`,
              borderRadius: 10,
              boxShadow: popShadow(theme.paper === "#FFFDF4" ? "#00000055" : theme.paper, 4),
              marginBottom: 26,
            }}
          >
            The problem
          </span>
          <KineticHeadline
            text={headline}
            color={theme.paper}
            ink={theme.ink}
            fontSize={112}
            startFrame={8}
            align="left"
            highlightWord={words.length - 1}
            highlightFill={theme.pop[0]}
            highlightText={readableOn(theme.pop[0], theme.ink, theme.paper)}
            maxWidth="94%"
          />
          {scene.sub ? (
            <p
              style={{
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 38,
                color: theme.paper,
                opacity: 0.82,
                marginTop: 28,
                maxWidth: "82%",
              }}
            >
              {scene.sub}
            </p>
          ) : null}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
