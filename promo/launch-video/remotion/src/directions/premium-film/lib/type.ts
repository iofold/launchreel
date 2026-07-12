// Premium-film typography — elegant, serif-adjacent faces for the cinematic direction.
// Loaded via @remotion/google-fonts so they render identically in preview and in the
// headless render. Only this direction imports these; other directions are untouched.
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadMarcellus } from "@remotion/google-fonts/Marcellus";
import { loadFont as loadEBGaramond } from "@remotion/google-fonts/EBGaramond";

// High-contrast Garamond — the main cinematic voice (hook lines, captions).
const cormorant = loadCormorant("normal", {
  weights: ["300", "400", "500", "600"],
  subsets: ["latin"],
});
// Marcellus — a calm inscriptional Roman, perfect for tracked small-caps + the marquee.
const marcellus = loadMarcellus("normal", { weights: ["400"], subsets: ["latin"] });
// EB Garamond — quiet body/detail text on the end-card.
const ebGaramond = loadEBGaramond("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const FONT = {
  serif: cormorant.fontFamily, // Cormorant Garamond
  roman: marcellus.fontFamily, // Marcellus
  body: ebGaramond.fontFamily, // EB Garamond
} as const;
