import React from "react";
import { COLORS, CREW } from "../../lib/brand";

// Rounded-square bot heads rebuilt from mock-2-jobboard.png. The joke is
// consistency: every crew member shares the identical friendly face; only the
// brand color + one distinguishing accessory changes ("same actor, new hat").
const INK = COLORS.ink;

const Face: React.FC<{ blink?: boolean }> = ({ blink }) => (
  <g>
    {/* eyes */}
    <circle cx={46} cy={62} r={12} fill="#FFFDF4" stroke={INK} strokeWidth={3} />
    <circle cx={78} cy={62} r={12} fill="#FFFDF4" stroke={INK} strokeWidth={3} />
    {blink ? (
      <>
        <line x1={38} y1={62} x2={54} y2={62} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <line x1={70} y1={62} x2={86} y2={62} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx={48} cy={64} r={5} fill={INK} />
        <circle cx={80} cy={64} r={5} fill={INK} />
        <circle cx={50} cy={62} r={1.6} fill="#FFFDF4" />
        <circle cx={82} cy={62} r={1.6} fill="#FFFDF4" />
      </>
    )}
    {/* small smile */}
    <path d="M50 84 Q62 94 74 84" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    {/* cheeks */}
    <circle cx={34} cy={80} r={5} fill="#FFFFFF" opacity={0.28} />
    <circle cx={90} cy={80} r={5} fill="#FFFFFF" opacity={0.28} />
  </g>
);

const Accessory: React.FC<{ index: number }> = ({ index }) => {
  switch (index) {
    case 0: // Scout — round spectacles (researcher goggles)
      return (
        <g stroke={INK} strokeWidth={4} fill="none">
          <circle cx={46} cy={62} r={17} />
          <circle cx={78} cy={62} r={17} />
          <line x1={62} y1={60} x2={62} y2={62} />
          <path d="M63 62 h-1" />
          <line x1={29} y1={58} x2={20} y2={52} strokeLinecap="round" />
          <line x1={95} y1={58} x2={104} y2={52} strokeLinecap="round" />
        </g>
      );
    case 1: // Strategist — lightbulb (the idea)
      return (
        <g>
          <line x1={62} y1={22} x2={62} y2={8} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <circle cx={62} cy={-2} r={11} fill={COLORS.yellow} stroke={INK} strokeWidth={4} />
          <rect x={57} y={7} width={10} height={5} rx={1.5} fill={INK} />
          <path d="M58 -4 q4 -6 8 0" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      );
    case 2: // Director — beret
      return (
        <g>
          <ellipse cx={62} cy={20} rx={40} ry={15} fill={INK} />
          <path d="M24 22 q38 14 76 0" fill="none" stroke={INK} strokeWidth={0} />
          <rect x={22} y={20} width={80} height={7} rx={3} fill={INK} />
          <circle cx={62} cy={6} r={5} fill={INK} />
        </g>
      );
    case 3: // Renderer — antenna
      return (
        <g>
          <line x1={62} y1={20} x2={62} y2={4} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <circle cx={62} cy={0} r={7} fill={COLORS.pink} stroke={INK} strokeWidth={3.5} />
        </g>
      );
    case 4: // Publisher — megaphone
      return (
        <g transform="translate(0,0)">
          <path d="M108 44 l22 -12 v40 l-22 -12 z" fill={COLORS.yellow} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
          <rect x={98} y={48} width={12} height={20} rx={3} fill={COLORS.yellow} stroke={INK} strokeWidth={4} />
          <g stroke={INK} strokeWidth={3.2} strokeLinecap="round">
            <path d="M134 40 q8 18 0 36" fill="none" />
          </g>
        </g>
      );
    default:
      return null;
  }
};

export const Bot: React.FC<{ index: number; size: number; blink?: boolean }> = ({
  index,
  size,
  blink,
}) => {
  const color = CREW[index].color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-20 -18 160 150"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* hard offset shadow */}
      <rect x={16} y={26} width={100} height={92} rx={28} fill={INK} />
      {/* head */}
      <rect x={10} y={18} width={100} height={92} rx={28} fill={color} stroke={INK} strokeWidth={4} />
      {/* top glossy band */}
      <path d="M22 32 q40 -14 78 0 v10 q-40 -12 -78 0 z" fill="#FFFFFF" opacity={0.18} />
      <Face blink={blink} />
      <Accessory index={index} />
    </svg>
  );
};
