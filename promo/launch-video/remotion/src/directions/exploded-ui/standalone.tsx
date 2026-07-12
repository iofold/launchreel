// Standalone render entry for the exploded-ui direction ONLY.
// Lets this direction render/iterate without bundling sibling directions
// (a broken font load in another direction otherwise breaks the shared Root).
// The final MP4 is identical to rendering "ExplodedUI" from src/index.ts.
import React from "react";
import { registerRoot, Composition } from "remotion";
import { VIDEO } from "../../lib/brand";
import { ExplodedUI } from "./Comp";

const Root: React.FC = () => (
  <Composition
    id="ExplodedUI"
    component={ExplodedUI}
    width={VIDEO.width}
    height={VIDEO.height}
    fps={VIDEO.fps}
    durationInFrames={VIDEO.durationInFrames}
  />
);

registerRoot(Root);
