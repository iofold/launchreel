import { useEffect, useState } from "react";
import { staticFile, delayRender, continueRender } from "remotion";

/**
 * Vendored fonts (public/fonts) so renders are offline-safe and deterministic —
 * no Google Fonts fetch at render time. Archivo Black = pop display headline,
 * Archivo (variable) = body / labels.
 */
export const DISPLAY = "'Archivo Black', 'Arial Black', system-ui, sans-serif";
export const BODY = "'Archivo', system-ui, sans-serif";

export function useLoadFonts() {
  const [handle] = useState(() => delayRender("load-fonts"));
  useEffect(() => {
    let cancelled = false;
    const faces = [
      new FontFace("Archivo Black", `url(${staticFile("fonts/ArchivoBlack-Regular.ttf")})`, {
        weight: "400",
      }),
      new FontFace("Archivo", `url(${staticFile("fonts/Archivo-Variable.ttf")})`, {
        weight: "100 900",
      }),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        if (cancelled) return;
        loaded.forEach((f) => (document.fonts as FontFaceSet).add(f));
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
    return () => {
      cancelled = true;
    };
  }, [handle]);
}
