import { Composition } from "remotion";
import { VIDEO } from "./lib/brand";
import { ChannelZap } from "./directions/channel-zap/Comp";
import { ExplodedUI } from "./directions/exploded-ui/Comp";
import { TheCrew } from "./directions/the-crew/Comp";
import { MidnightLaunch } from "./directions/midnight-launch/Comp";
import { OpeningNight } from "./directions/premium-film/Comp";
import { SpeedrunReceipt } from "./directions/speedrun-receipt/Comp";

const shared = {
  width: VIDEO.width,
  height: VIDEO.height,
  fps: VIDEO.fps,
  durationInFrames: VIDEO.durationInFrames,
} as const;

// One composition per direction. Direction agents: edit ONLY your own
// src/directions/<slug>/ folder. If your final cut is not exactly 900 frames,
// change durationInFrames on YOUR line only.
export const Root: React.FC = () => {
  return (
    <>
      <Composition id="ChannelZap" component={ChannelZap} {...shared} />
      <Composition id="ExplodedUI" component={ExplodedUI} {...shared} />
      <Composition id="TheCrew" component={TheCrew} {...shared} />
      <Composition id="MidnightLaunch" component={MidnightLaunch} {...shared} />
      <Composition id="OpeningNight" component={OpeningNight} {...shared} />
      <Composition id="SpeedrunReceipt" component={SpeedrunReceipt} {...shared} />
    </>
  );
};
