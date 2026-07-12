import React from "react";
import { Composition } from "remotion";
import { Trailer, totalDurationInFrames } from "./Trailer";
import { storyboard as storyboardSchema, WIDTH, HEIGHT, FPS, type Storyboard } from "./schema";

/**
 * Self-contained default so `remotion studio` always renders even with no staged
 * assets — screenshots are empty here, exercising the graceful-degradation path.
 * Real trailers pass a full storyboard (with screenshots) via --props at render time.
 */
const DEFAULT_PROPS: Storyboard = {
  brand: {
    name: "LaunchReel",
    oneLiner: "Your launch trailer, in minutes.",
    url: "launchreel.pages.dev",
    colors: {
      bg: "#FFF3D6",
      accent: "#2F5BFF",
      ink: "#17130D",
      paper: "#FFFDF4",
      accent2: "#FF3D8B",
      accent3: "#FFC93C",
      accent4: "#20C077",
    },
  },
  watermark: false,
  audio: {},
  scenes: [
    { type: "hook", durationSec: 5, headline: "Ship it with a bang.", sub: "Assets in. Branded trailer out.", screenshotPaths: [], metrics: [] },
    { type: "problem", durationSec: 5, headline: "Launch videos take weeks.", sub: "Editors, briefs, revisions, renders.", screenshotPaths: [], metrics: [] },
    { type: "tour_a", durationSec: 6, headline: "Watch the crew work.", sub: "Live pipeline", screenshotPaths: [], metrics: [{ label: "scenes", value: "6" }, { label: "minutes", value: "3" }] },
    { type: "tour_b", durationSec: 6, headline: "Six scenes, on-brand.", sub: "Zero editing", screenshotPaths: [], metrics: [{ label: "cost / trailer", value: "$0.65" }] },
    { type: "social_proof", durationSec: 5, headline: "Founders love it.", sub: "", screenshotPaths: [], metrics: [{ label: "trailers made", value: "612" }], quote: { text: "A launch trailer before my coffee cooled.", author: "YC founder" } },
    { type: "cta", durationSec: 3, headline: "Your launch trailer, in minutes.", sub: "Claim your trailer →", screenshotPaths: [], metrics: [] },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Trailer"
      component={Trailer}
      schema={storyboardSchema}
      defaultProps={DEFAULT_PROPS as unknown as Storyboard}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={900}
      calculateMetadata={({ props }) => {
        const parsed = storyboardSchema.parse(props);
        return { durationInFrames: totalDurationInFrames(parsed), props: parsed };
      }}
    />
  );
};
