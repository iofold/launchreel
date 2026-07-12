import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { PHASE } from "./theme";
import { LAYERS } from "./layers";
import { Frame3D } from "./Frame3D";
import { camera, layerAmt, reveal, chipOpacity, implodeBlur, crewPulse, peelAmt, wordPulse } from "./drivers";
import { Hud } from "./Hud";
import { Flashes, HookStamp, CrewRoster, PeelStamp, WordChecklist } from "./Overlays";
import { EndCard } from "./EndCard";
import { Mix } from "./Audio";

const Studio: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 34%, #2A2318 0%, #191509 52%, #0E0B06 100%)" }}>
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,235,190,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,235,190,0.035) 1px,transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(70% 60% at 50% 45%, #000 30%, transparent 85%)",
      }}
    />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 62%, rgba(0,0,0,0.45) 100%)" }} />
  </AbsoluteFill>
);

export const ExplodedUI: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camera(f);
  const blur = implodeBlur(f);
  const n = LAYERS.length;
  const showEndcard = f >= PHASE.endcardStart - 2;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E0B06" }}>
      <Studio />

      <Frame3D
        camera={cam}
        amt={(_l, i) => layerAmt(f, i, n)}
        reveal={(l, i) => reveal(f, i, l.hero)}
        chip={(_l, i) => chipOpacity(f, i)}
        blur={blur}
        emphasize={(l) => Math.max(crewPulse(f, l.crew), wordPulse(f, l.id))}
        peel={peelAmt(f)}
      />

      <Hud />
      <WordChecklist />
      <CrewRoster />
      <HookStamp />
      <PeelStamp />
      <Flashes />

      {showEndcard && <EndCard />}

      <Mix />
    </AbsoluteFill>
  );
};
