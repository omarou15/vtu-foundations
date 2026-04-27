/**
 * VTU — It. 13 : onglet Mapbox (stub "Coming soon").
 */

import { MapPin } from "lucide-react";
import { ComingSoonPanel } from "./ComingSoonPanel";

export function MapboxTab() {
  return (
    <ComingSoonPanel
      Icon={MapPin}
      title="Vue satellite du site"
      description="Localisation précise du bâtiment audité, vue aérienne et contexte urbain en un coup d'œil."
      bullets={[
        "Carte satellite Mapbox centrée sur l'adresse de la VT",
        "Marqueur du bâtiment + bâtiments adjacents",
        "Mesure de surface au sol et orientation",
      ]}
    />
  );
}
