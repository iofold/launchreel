import { z } from "zod";

/**
 * LaunchReel storyboard schema — the ONLY thing the LLM storyboard-writer produces.
 * The renderer is deterministic: no LLM-authored render code, ever. Everything the
 * trailer shows is derived from this object + the referenced asset files.
 *
 * Asset paths (logoPath, screenshotPaths[], bgVideoPath, audio.*) are resolved by
 * scripts/render.ts relative to the --assets dir, copied into the Remotion public
 * dir, and rewritten to staticFile()-relative paths before this reaches the comp.
 * Optional assets may be omitted or empty ("") — scenes degrade to solid brand fields.
 */

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected a hex color like #2F5BFF");

export const sceneType = z.enum([
  "hook",
  "problem",
  "tour_a",
  "tour_b",
  "social_proof",
  "cta",
]);
export type SceneType = z.infer<typeof sceneType>;

export const metric = z.object({
  label: z.string().default(""),
  value: z.string().default(""),
});

export const quote = z.object({
  text: z.string().default(""),
  author: z.string().default(""),
});

export const scene = z.object({
  type: sceneType,
  durationSec: z.number().min(1).max(15).default(5),
  headline: z.string().default(""),
  sub: z.string().default(""),
  screenshotPaths: z.array(z.string()).default([]),
  metrics: z.array(metric).default([]),
  quote: quote.optional(),
  /** optional Veo b-roll rendered UNDER the Remotion text (Hook / CTA only) */
  bgVideoPath: z.string().optional(),
});
export type Scene = z.infer<typeof scene>;

export const brandColors = z.object({
  bg: hex, // page background (LaunchReel cream #FFF3D6)
  accent: hex, // primary brand accent (LaunchReel blue #2F5BFF)
  ink: hex, // near-black text / borders (#17130D)
  // optional richer pop palette — if absent, extra accents are derived from `accent`
  paper: hex.optional(),
  accent2: hex.optional(),
  accent3: hex.optional(),
  accent4: hex.optional(),
});
export type BrandColors = z.infer<typeof brandColors>;

export const brand = z.object({
  name: z.string(),
  oneLiner: z.string().default(""),
  url: z.string().default(""),
  colors: brandColors,
  logoPath: z.string().optional(),
});

export const audio = z
  .object({
    voPath: z.string().optional(),
    musicPath: z.string().optional(),
  })
  .default({});

export const storyboard = z.object({
  brand,
  scenes: z.array(scene).min(1),
  audio: audio,
  watermark: z.boolean().default(false),
});
export type Storyboard = z.infer<typeof storyboard>;

/** Fixed output format — the plan is pre-cut to a single 9:16 aspect. */
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
