/**
 * VTU — Hook clavier virtuel iOS / Android.
 *
 * Met à jour la variable CSS `--kb-height` sur :root selon la hauteur
 * occupée par le clavier virtuel. Utilise `window.visualViewport` quand
 * disponible (iOS Safari, Chrome Android moderne) :
 *
 *   --kb-height = max(0, window.innerHeight - visualViewport.height - offsetTop)
 *
 * Couplé à l'utilitaire CSS `.input-bar-safe-bottom` (cf. styles.css),
 * ça garantit que la barre d'input reste visible au-dessus du clavier
 * sans déplacer le layout général (KNOWLEDGE §5 : "L'input bar NE BOUGE
 * JAMAIS quand le clavier s'ouvre").
 */

import { useEffect } from "react";

export function useVirtualKeyboard(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    function update() {
      if (!vv) return;
      const occluded = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      root.style.setProperty("--kb-height", `${Math.round(occluded)}px`);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.setProperty("--kb-height", "0px");
    };
  }, []);
}
