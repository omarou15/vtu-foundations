import { Image as ImageIcon, FileText, AlertTriangle } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@tanstack/react-router";
import { getDb, type LocalVisit } from "@/shared/db";
import {
  BUILDING_ICON,
  BUILDING_LABEL,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
} from "../lib/icons";

interface VisitCardProps {
  visit: LocalVisit;
  active?: boolean;
}

/**
 * VisitCard — entry de la sidebar.
 *
 * Compteurs (photos / notes texte) calculés via `useLiveQuery` sur Dexie.
 * Pas de hardcode 0 : si la VT n'a aucun message encore, useLiveQuery
 * retourne 0 légitimement, et se met à jour dès qu'un message arrive.
 */
export function VisitCard({ visit, active }: VisitCardProps) {
  const photoCount = useLiveQuery(
    () =>
      getDb()
        .attachments.where("visit_id")
        .equals(visit.id)
        .filter((a) => a.bucket === "visit-photos")
        .count(),
    [visit.id],
    0,
  );

  const noteCount = useLiveQuery(
    () =>
      getDb()
        .messages.where("visit_id")
        .equals(visit.id)
        .filter((m) => m.kind === "text" && m.role === "user")
        .count(),
    [visit.id],
    0,
  );

  // Itération 6 : badge ⚠️ si la visite elle-même OU au moins un de ses
  // messages est en sync_status="failed".
  const hasFailedSync = useLiveQuery(
    async () => {
      if (visit.sync_status === "failed") return true;
      const failedMsg = await getDb()
        .messages.where("visit_id")
        .equals(visit.id)
        .filter((m) => m.sync_status === "failed")
        .first();
      return Boolean(failedMsg);
    },
    [visit.id, visit.sync_status],
    false,
  );

  const Icon = visit.building_type ? BUILDING_ICON[visit.building_type] : BUILDING_ICON.autre;
  const buildingLabel = visit.building_type
    ? BUILDING_LABEL[visit.building_type]
    : "Type ?";

  return (
    <Link
      to="/visits/$visitId"
      params={{ visitId: visit.id }}
      className={`group flex w-full gap-3 rounded-md border border-transparent p-3 text-left transition-colors hover:bg-sidebar-accent ${
        active ? "bg-sidebar-accent" : ""
      }`}
      aria-current={active ? "page" : undefined}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
        aria-hidden="true"
        title={buildingLabel}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-ui truncate text-sm font-semibold text-foreground">
            {visit.title}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasFailedSync ? (
              <span
                className="font-ui inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                title="Synchronisation échouée"
                aria-label="Synchronisation échouée"
                data-testid="sync-failed-badge"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              </span>
            ) : null}
            <span
              className={`font-ui rounded-full px-2 py-0.5 text-[10px] font-medium ${
                STATUS_BADGE_CLASS[visit.status]
              }`}
            >
              {STATUS_LABEL[visit.status]}
            </span>
          </div>
        </div>

        <p className="font-body mt-0.5 truncate text-xs text-muted-foreground">
          {visit.address ?? "Adresse non renseignée"}
        </p>

        <div className="font-ui mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{photoCount}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{noteCount}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
