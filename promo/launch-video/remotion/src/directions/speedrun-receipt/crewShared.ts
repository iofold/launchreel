// Crew montage timeline (LOCAL frames; JobBoard sequence starts at global 250).
// Shared by JobBoard.tsx and the SFX bus so status-flip ticks land on the visuals.
import { COLORS } from "../../lib/brand";

export const CREW_FROM = 250;

export type Agent = { name: string; role: string; color: string; work: number; done: number };
export const AGENTS: Agent[] = [
  { name: "Scout", role: "Brand research", color: COLORS.blue, work: 8, done: 66 },
  { name: "Strategist", role: "Creative brief", color: COLORS.purple, work: 66, done: 128 },
  { name: "Director", role: "Storyboard", color: COLORS.pink, work: 128, done: 196 },
  { name: "Renderer", role: "Motion + VO", color: COLORS.green, work: 196, done: 268 },
  { name: "Publisher", role: "Premiere", color: COLORS.orange, work: 268, done: 330 },
];

export function agentState(a: Agent, f: number): "waiting" | "working…" | "done ✓" {
  if (f < a.work) return "waiting";
  if (f < a.done) return "working…";
  return "done ✓";
}

export type Scene = { label: string; emoji: string; done: number };
export const SCENES: Scene[] = [
  { label: "Hook", emoji: "🪝", done: 140 },
  { label: "Problem", emoji: "😵", done: 152 },
  { label: "Tour A", emoji: "🖥️", done: 164 },
  { label: "Tour B", emoji: "✨", done: 176 },
  { label: "Proof", emoji: "⭐", done: 188 },
  { label: "CTA", emoji: "🚀", done: 200 },
];

export type Feed = { t: number; a: string; text: string };
export const FEED: Feed[] = [
  { t: 10, a: "Scout", text: "scanning your logo + screenshots… 🔍" },
  { t: 28, a: "Scout", text: "pulled brand colors #2F5BFF / #FFC93C" },
  { t: 46, a: "Scout", text: "vibe check — fintech, clean, a little playful" },
  { t: 70, a: "Strategist", text: "angle = “bookkeeping that runs itself.”" },
  { t: 88, a: "Strategist", text: "writing a 30-second beat sheet…" },
  { t: 106, a: "Strategist", text: "hook › problem › payoff. locked." },
  { t: 132, a: "Director", text: "boarding scene 4 / 6…" },
  { t: 150, a: "Director", text: "6 scenes storyboarded ✓" },
  { t: 168, a: "Director", text: "note to Renderer: hold the logo 12 frames" },
  { t: 200, a: "Renderer", text: "VO take 2 mixed 🎙️" },
  { t: 224, a: "Renderer", text: "motion pass — 900 frames, ducking music" },
  { t: 248, a: "Renderer", text: "MP4 exported · 1080×1920 ✓" },
  { t: 272, a: "Publisher", text: "premiere page built 📄" },
  { t: 300, a: "Publisher", text: "shipping to your inbox…" },
];

export const AGENT_COLOR: Record<string, string> = Object.fromEntries(
  AGENTS.map((a) => [a.name, a.color]),
);

// Every status-flip frame (local) — used to schedule tick SFX.
export const FLIP_FRAMES: number[] = [
  ...AGENTS.map((a) => a.work),
  ...AGENTS.map((a) => a.done),
  ...SCENES.map((s) => s.done),
];
