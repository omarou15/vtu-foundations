/**
 * VTU — It. 13 : onglet Export → Email (stub "Coming soon").
 */

import { Mail } from "lucide-react";
import { ComingSoonPanel } from "./ComingSoonPanel";

export function ExportEmailTab() {
  return (
    <ComingSoonPanel
      Icon={Mail}
      title="Envoyer par email"
      description="Sélectionnez les livrables et destinataires, l'envoi se fait depuis l'app — sans quitter la VT."
      bullets={[
        "Sélection multi-documents (audit, DPE, photos)",
        "Plusieurs destinataires (client, copro, mairie)",
        "Modèle d'email pré-rempli, modifiable",
      ]}
    />
  );
}
