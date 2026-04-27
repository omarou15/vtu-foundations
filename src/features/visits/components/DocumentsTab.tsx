/**
 * VTU — It. 13 : onglet Documents (famille Artifacts).
 *
 * Wrapper avec 3 sous-onglets côte à côte :
 *  - Photos       : grille des photos capturées (réutilise PhotosTab)
 *  - Input docs   : PDF, plans, docs client (coming soon)
 *  - Output docs  : rapports générés (coming soon)
 *
 * Le sous-onglet courant est mémorisé en localStorage pour persister
 * entre les ouvertures du drawer.
 */

import { useEffect, useState } from "react";
import { FileInput, FileOutput, Images } from "lucide-react";
import { PhotosTab } from "./PhotosTab";
import { ComingSoonPanel } from "./ComingSoonPanel";

export type DocumentsSubTab = "photos" | "input" | "output";

interface DocumentsTabProps {
  visitId: string;
}

const STORAGE_KEY = "vtu:visit-drawer:doc-subtab";

const SUBTABS: Array<{
  key: DocumentsSubTab;
  label: string;
  Icon: typeof Images;
}> = [
  { key: "photos", label: "Photos", Icon: Images },
  { key: "input", label: "Input docs", Icon: FileInput },
  { key: "output", label: "Output docs", Icon: FileOutput },
];

function readStored(): DocumentsSubTab {
  if (typeof window === "undefined") return "photos";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "photos" || v === "input" || v === "output") return v;
  } catch {
    /* ignore */
  }
  return "photos";
}

export function DocumentsTab({ visitId }: DocumentsTabProps) {
  const [sub, setSub] = useState<DocumentsSubTab>(() => readStored());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, sub);
    } catch {
      /* ignore */
    }
  }, [sub]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="documents-tab"
    >
      {/* Sous-onglets */}
      <div className="border-b border-border/60 bg-card/40 px-2 py-1.5">
        <nav
          className="flex gap-1"
          role="tablist"
          aria-label="Sous-sections documents"
        >
          {SUBTABS.map(({ key, label, Icon }) => {
            const active = sub === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSub(key)}
                data-testid={`documents-subtab-${key}`}
                className={[
                  "font-ui inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {sub === "photos" ? <PhotosTab visitId={visitId} /> : null}
        {sub === "input" ? (
          <ComingSoonPanel
            Icon={FileInput}
            title="Documents importés"
            description="Importez les pièces fournies par le client : plans, DPE existant, factures énergie, devis fournisseurs."
            bullets={[
              "Drop PDF / images / plans",
              "Indexation automatique du contenu",
              "Lien direct vers les sections concernées",
            ]}
          />
        ) : null}
        {sub === "output" ? (
          <ComingSoonPanel
            Icon={FileOutput}
            title="Rapports générés"
            description="Tous les livrables produits depuis la VT : rapport d'audit Word, DPE, PPPT, export JSON."
            bullets={[
              "Rapport audit énergétique (.docx)",
              "DPE projeté (.pdf)",
              "Plan Pluriannuel de Travaux (.docx)",
              "Export JSON technique",
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
