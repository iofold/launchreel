import { AbsoluteFill } from "remotion";
import { COLORS, PRODUCT } from "../../lib/brand";

// STUB — replaced by the exploded-ui direction agent. See promo/launch-video/directions/.
export const ExplodedUI: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.cream,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 80, fontWeight: 900, color: COLORS.ink }}>
        ExplodedUI
      </div>
      <div style={{ fontSize: 40, color: COLORS.ink }}>{PRODUCT.tagline}</div>
    </AbsoluteFill>
  );
};
