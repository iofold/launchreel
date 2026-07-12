// Direction 06 — 0:47 · SPEEDRUN RECEIPT. Real-time proof: a speedrun timer runs the
// whole 30s while the real product flow happens — intake → crew → delivery → receipt.
// Zero gen-video; every screen rebuilt natively from public/assets/full-*.png.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "../../lib/brand";
import { TL } from "./timer";
import { TimerHUD } from "./Timer";
import { Confetti } from "./Confetti";
import { Sfx } from "./Sfx";
import { Hook } from "./scenes/Hook";
import { Intake } from "./scenes/Intake";
import { JobBoard } from "./scenes/JobBoard";
import { Delivery } from "./scenes/Delivery";
import { Receipt } from "./scenes/Receipt";

export const SpeedrunReceipt: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.cream }}>
      <Sequence from={TL.hook.from} durationInFrames={TL.hook.dur}>
        <Hook />
      </Sequence>
      <Sequence from={TL.intake.from} durationInFrames={TL.intake.dur}>
        <Intake />
      </Sequence>
      <Sequence from={TL.crew.from} durationInFrames={TL.crew.dur}>
        <JobBoard />
      </Sequence>
      <Sequence from={TL.delivery.from} durationInFrames={TL.delivery.dur}>
        <Delivery />
      </Sequence>
      <Sequence from={TL.receipt.from} durationInFrames={TL.receipt.dur}>
        <Receipt />
      </Sequence>

      {/* global overlays */}
      <Confetti startFrame={TL.delivery.from} />
      <TimerHUD />

      <Sfx />
    </AbsoluteFill>
  );
};
