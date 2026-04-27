/**
 * VTU — It. 13 : onglet Export → Monday.com (stub "Coming soon").
 */

import { Trello } from "lucide-react";
import { ComingSoonPanel } from "./ComingSoonPanel";

export function ExportMondayTab() {
  return (
    <ComingSoonPanel
      Icon={Trello}
      title="Exporter vers Monday.com"
      description="Création automatique d'un item dans le board CRM avec toutes les données de la visite."
      bullets={[
        "Mapping JSON → colonnes Monday",
        "Pièces jointes : photos clés + rapport Word",
        "Statut synchronisé avec l'avancement de la VT",
      ]}
    />
  );
}
