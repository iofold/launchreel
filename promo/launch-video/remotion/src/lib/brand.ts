// LaunchReel brand tokens — extracted from web/index.html (the shipped Pop Studio × Broadcast TV UI).
// Every direction uses these. Do not invent new hex values for brand surfaces.

export const COLORS = {
  cream: "#FFF3D6", // page background
  paper: "#FFFDF4", // card background
  ink: "#17130D", // text / borders
  yellow: "#FFC93C", // primary accent (buttons, highlights)
  pink: "#FF3D8B", // hot accent (Simulate, Director)
  blue: "#2F5BFF", // Scout / video frames
  green: "#20C077", // Renderer / success
  purple: "#7C4DFF", // Strategist
  orange: "#FF6B2C", // Publisher
  sky: "#CDE7FF", // soft panel fill
} as const;

// Neo-brutalist "pop" chrome: thick ink borders + hard offset shadows, generous radii.
export const CHROME = {
  border: `3px solid ${COLORS.ink}`,
  shadow: `6px 6px 0 ${COLORS.ink}`,
  shadowSm: `3px 3px 0 ${COLORS.ink}`,
  radius: 16,
  radiusSm: 10,
} as const;

// Toolkit house easing — use for almost every entrance.
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const CREW = [
  { name: "Scout", role: "Brand research", color: COLORS.blue, emoji: "🧐" },
  { name: "Strategist", role: "Creative brief", color: COLORS.purple, emoji: "🧠" },
  { name: "Director", role: "Storyboard", color: COLORS.pink, emoji: "🎬" },
  { name: "Renderer", role: "Motion + VO", color: COLORS.green, emoji: "🤖" },
  { name: "Publisher", role: "Premiere", color: COLORS.orange, emoji: "📣" },
] as const;

export const PRODUCT = {
  name: "LaunchReel",
  tagline: "Your launch trailer, in minutes.",
  url: "launchreel.xyz",
  tiers: [
    { name: "Free teaser", price: "₹0", detail: "10-sec watermarked teaser" },
    { name: "Launch Trailer", price: "₹999", detail: "Polished 30-sec · clean export" },
    { name: "Content Pack", price: "₹2,999", detail: "Trailer + 3 posts + OG images" },
  ],
} as const;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 900, // 30s
} as const;
