import { Composition, Still } from "remotion";
import { VIDEO } from "./lib/brand";
import { Thumb01, Thumb02, Thumb03, Thumb04, Thumb05, Thumb06 } from "./thumbs/Thumbs";
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
      <Still id="Thumb01" component={Thumb01} width={VIDEO.width} height={VIDEO.height} />
      <Still id="Thumb02" component={Thumb02} width={VIDEO.width} height={VIDEO.height} />
      <Still id="Thumb03" component={Thumb03} width={VIDEO.width} height={VIDEO.height} />
      <Still id="Thumb04" component={Thumb04} width={VIDEO.width} height={VIDEO.height} />
      <Still id="Thumb05" component={Thumb05} width={VIDEO.width} height={VIDEO.height} />
      <Still id="Thumb06" component={Thumb06} width={VIDEO.width} height={VIDEO.height} />
    </>
  );
};
