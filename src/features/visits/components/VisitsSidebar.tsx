import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Search, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { useDebouncedValue } from "@/shared/hooks";
import { createLocalVisit, listLocalVisitsByUser } from "@/shared/db";
import { groupVisitsByDate } from "../lib/grouping";
import { filterVisitsByQuery } from "../lib/search";
import { VisitCard } from "./VisitCard";
import { NewVisitDialog, type NewVisitFormValue } from "./NewVisitDialog";

interface VisitsSidebarProps {
  /** Permet à un parent (mobile) de fermer la sidebar drawer. No-op sinon. */
  onClose?: () => void;
  /** ID de la visite actuellement ouverte (pour highlight). */
  activeVisitId?: string;
}

/**
 * Sidebar VTs (Itération 4) — écran 1 de la maquette.
 *
 * Composition :
 * - Header sticky : ✕ · logo VTU · ⚙️ (no-op Phase 1)
 * - Recherche debounce 150ms + normalize accents
 * - Liste groupée par date (AUJOURD'HUI / HIER / CETTE SEMAINE / PLUS ANCIEN)
 * - Bouton "+ Nouvelle visite" sticky bottom (safe-bottom)
 * - Lecture via useLiveQuery sur Dexie : pas de fetch direct.
 */
export function VisitsSidebar({ onClose, activeVisitId }: VisitsSidebarProps) {
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 150);

  // Lecture live depuis Dexie (offline-first).
  const visits = useLiveQuery(
    () => (userId ? listLocalVisitsByUser(userId) : Promise.resolve([])),
    [userId],
    [],
  );

  const filtered = useMemo(
    () => filterVisitsByQuery(visits, debouncedQuery),
    [visits, debouncedQuery],
  );

  const groups = useMemo(() => groupVisitsByDate(filtered), [filtered]);

  async function handleCreate(value: NewVisitFormValue) {
    if (!userId) {
      toast.error("Session expirée — veuillez vous reconnecter.");
      return;
    }
    try {
      const { visit } = await createLocalVisit({
        userId,
        title: value.title,
        address: value.address,
        missionType: value.mission_type,
        buildingType: value.building_type,
      });
      setDialogOpen(false);
      toast.success("Visite créée", { description: visit.title });
      navigate({
        to: "/visits/$visitId",
        params: { visitId: visit.id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Impossible de créer la visite", { description: message });
    }
  }

  return (
    <aside
      className="flex h-dvh w-full flex-col bg-sidebar text-sidebar-foreground"
      aria-label="Liste des visites techniques"
    >
      {/* Header — safe-top */}
      <header className="safe-top safe-x border-b border-sidebar-border">
        <div className="flex h-14 items-center justify-between px-3">
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: "var(--vtu-primary)" }}
              aria-hidden="true"
            >
              <span className="font-ui text-xs font-bold text-white">V</span>
            </div>
            <span className="font-heading text-base font-semibold tracking-tight">
              VTU
            </span>
          </div>

          <button
            type="button"
            onClick={() => toast.message("Paramètres — bientôt disponible")}
            className="touch-target inline-flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Paramètres"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Recherche */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une visite…"
              aria-label="Rechercher une visite"
              className="font-ui pl-9"
            />
          </div>
        </div>
      </header>

      {/* Liste scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {visits.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : groups.length === 0 ? (
          <NoMatch query={debouncedQuery} />
        ) : (
          <ul className="space-y-4" role="list">
            {groups.map((group) => (
              <li key={group.bucket}>
                <h2
                  className="font-ui px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  id={`group-${group.bucket}`}
                >
                  {group.label}
                </h2>
                <ul className="space-y-1" aria-labelledby={`group-${group.bucket}`}>
                  {group.visits.map((v) => (
                    <li key={v.id}>
                      <VisitCard visit={v} active={v.id === activeVisitId} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bouton sticky bottom — safe-bottom */}
      <div className="safe-bottom safe-x border-t border-sidebar-border bg-sidebar">
        <div className="p-3">
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="font-ui h-12 w-full gap-2 text-sm font-semibold"
            style={{ minHeight: 48 }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Nouvelle visite
          </Button>
        </div>
      </div>

      <NewVisitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </aside>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--vtu-primary)" }}
        aria-hidden="true"
      >
        <Plus className="h-6 w-6 text-white" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-foreground">
        Aucune visite
      </h3>
      <p className="font-body mt-1 text-sm text-muted-foreground">
        Créez votre première visite technique pour commencer.
      </p>
      <Button onClick={onCreate} className="font-ui mt-4">
        <Plus className="h-4 w-4" />
        Nouvelle visite
      </Button>
    </div>
  );
}

function NoMatch({ query }: { query: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-body text-sm text-muted-foreground">
        Aucune visite ne correspond à <strong>« {query} »</strong>.
      </p>
    </div>
  );
}
