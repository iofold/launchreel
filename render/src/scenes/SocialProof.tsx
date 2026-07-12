import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { SceneProps, SceneShell } from "./shell";
import { MetricCounter } from "../components/MetricCounter";
import { StickerField } from "../components/Deco";
import { popShadow } from "../components/util";
import { readableOn } from "../theme";
import { DISPLAY, BODY } from "../fonts";

/** Scene 5 — Social Proof: testimonial card slides up + big outcome metrics count. */
export const SocialProof: React.FC<SceneProps> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const q = scene.quote;
  const s = spring({ frame, fps, config: { damping: 15 } });
  const y = interpolate(s, [0, 1], [120, 0]);
  const textColor = readableOn(theme.bg, theme.ink, theme.paper);

  const stars = interpolate(frame, [6, 22], [0, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell bg={theme.pop[3]} ink={theme.ink}>
      <StickerField seed={5} emojis={["⭐️", "💬", "🚀", "❤️"]} />
      <AbsoluteFill style={{ padding: 90, justifyContent: "center", alignItems: "center", gap: 54 }}>
        {scene.headline ? (
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 72,
              color: readableOn(theme.pop[3], theme.ink, theme.paper),
              textAlign: "center",
              letterSpacing: "-0.02em",
            }}
          >
            {scene.headline}
          </div>
        ) : null}

        {q && q.text ? (
          <div
            style={{
              transform: `translateY(${y}px)`,
              opacity: s,
              background: theme.paper,
              border: `5px solid ${theme.ink}`,
              borderRadius: 30,
              padding: "48px 56px",
              boxShadow: popShadow(theme.ink, 12),
              maxWidth: "88%",
            }}
          >
            <div style={{ fontSize: 46, marginBottom: 14 }}>
              {"★★★★★".split("").map((c, i) => (
                <span key={i} style={{ color: i < stars ? theme.pop[2] : "#00000022" }}>
                  ★
                </span>
              ))}
            </div>
            <p
              style={{
                fontFamily: DISPLAY,
                fontSize: 60,
                lineHeight: 1.12,
                color: theme.ink,
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              “{q.text}”
            </p>
            {q.author ? (
              <p style={{ fontFamily: BODY, fontWeight: 800, fontSize: 34, color: theme.ink, opacity: 0.75, marginTop: 22 }}>
                — {q.author}
              </p>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", justifyContent: "center" }}>
          {scene.metrics.slice(0, 3).map((m, i) => (
            <MetricCounter
              key={i}
              label={m.label}
              value={m.value}
              fill={theme.pop[i % theme.pop.length]}
              textColor={readableOn(theme.pop[i % theme.pop.length], theme.ink, theme.paper)}
              ink={theme.ink}
              delay={14 + i * 6}
              size={62}
            />
          ))}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
