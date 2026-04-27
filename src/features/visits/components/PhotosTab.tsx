/**
 * VTU — It. 13 : Onglet Photos du UnifiedVisitDrawer.
 *
 * Grille type Telegram media viewer : carrés, gap minimal, scroll vertical.
 * Photos regroupées par section (linked_sections[0]) avec en-tête sticky.
 * Tap → MediaLightbox (réutilise le composant existant du chat).
 */

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, FileText, ImageOff, Layers } from "lucide-react";
import { getDb, type LocalAttachment } from "@/shared/db";
import { listVisitMedia } from "@/shared/photo";
import { MediaLightbox } from "@/features/chat/components/MediaLightbox";
import { groupMediaBySection } from "../lib/summary";

const SECTION_LABELS: Record<string, string> = {
  meta: "Identité",
  building: "Bâtiment",
  envelope: "Enveloppe",
  heating: "Chauffage",
  ecs: "Eau chaude sanitaire",
  ventilation: "Ventilation",
  cooling: "Climatisation",
  energy_production: "Production d'énergie",
  industriel_processes: "Procédés industriels",
  tertiaire_hors_cvc: "Tertiaire hors CVC",
  pathologies: "Pathologies",
  preconisations: "Préconisations",
  notes: "Notes",
  custom_observations: "Observations libres",
  other: "Non rattaché",
};

interface PhotosTabProps {
  visitId: string;
}

export function PhotosTab({ visitId }: PhotosTabProps) {
  const media = useLiveQuery(
    () => listVisitMedia(visitId),
    [visitId],
    [] as LocalAttachment[],
  );

  // Tri stable : photos d'abord, puis plans, puis PDF.
  const sortedMedia = useMemo(() => {
    const order = { photo: 0, plan: 1, pdf: 2 } as Record<string, number>;
    return [...media].sort(
      (a, b) =>
        (order[a.media_profile] ?? 9) - (order[b.media_profile] ?? 9) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );
  }, [media]);

  const grouped = useMemo(() => groupMediaBySection(sortedMedia), [sortedMedia]);
  const sectionKeys = useMemo(() => {
    // Ordre identique à VisitSummaryView, "other" en fin.
    const known = [
      "meta",
      "building",
      "envelope",
      "heating",
      "ecs",
      "ventilation",
      "cooling",
      "energy_production",
      "industriel_processes",
      "tertiaire_hors_cvc",
      "pathologies",
      "preconisations",
      "notes",
      "custom_observations",
    ];
    const present = new Set(Object.keys(grouped));
    const ordered = known.filter((k) => present.has(k));
    if (present.has("other")) ordered.push("other");
    // Filets de sécurité : sections inattendues
    for (const k of present) {
      if (!ordered.includes(k)) ordered.push(k);
    }
    return ordered;
  }, [grouped]);

  const [lightbox, setLightbox] = useState<{
    items: LocalAttachment[];
    index: number;
  } | null>(null);

  if (sortedMedia.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-body text-sm text-foreground">
          Aucune photo capturée pour cette visite.
        </p>
        <p className="font-ui text-xs text-muted-foreground">
          Les photos prises depuis le chat apparaîtront ici, regroupées par
          thème.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="photos-tab"
    >
      <div className="border-b border-border/60 bg-card/40 px-3 py-2">
        <p className="font-ui text-[11px] text-muted-foreground">
          {sortedMedia.length} média{sortedMedia.length > 1 ? "s" : ""} ·{" "}
          {sectionKeys.length} section{sectionKeys.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sectionKeys.map((sec) => {
          const items = grouped[sec] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={sec} className="border-b border-border/40 last:border-b-0">
              <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-background/95 px-3 py-1.5 backdrop-blur">
                <Layers
                  className="h-3 w-3 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="font-ui text-[11px] font-semibold text-foreground">
                  {SECTION_LABELS[sec] ?? sec.replace(/_/g, " ")}
                </h3>
                <span className="font-ui text-[10px] text-muted-foreground">
                  · {items.length}
                </span>
              </header>
              <div className="grid grid-cols-3 gap-0.5 p-0.5 sm:grid-cols-4">
                {items.map((m, i) => (
                  <PhotoTile
                    key={m.id}
                    attachment={m}
                    onClick={() => setLightbox({ items, index: i })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {lightbox ? (
        <MediaLightbox
          attachments={lightbox.items}
          initialIndex={lightbox.index}
          open
          onOpenChange={(o) => {
            if (!o) setLightbox(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PhotoTile({
  attachment,
  onClick,
}: {
  attachment: LocalAttachment;
  onClick: () => void;
}) {
  const isPdf = attachment.media_profile === "pdf";
  const blob = useLiveQuery(
    async () => {
      if (isPdf) return null;
      const row = await getDb().attachment_blobs.get(attachment.id);
      return row?.thumbnail ?? row?.compressed ?? null;
    },
    [attachment.id, isPdf],
    null as Blob | null,
  );

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-muted transition active:scale-[0.97]"
      aria-label="Voir le média"
    >
      {isPdf ? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-primary/5 text-primary">
          <FileText className="h-5 w-5" aria-hidden="true" />
          <span className="font-ui text-[9px] font-medium">PDF</span>
        </div>
      ) : url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {attachment.sync_status === "synced" ? (
            <ImageOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4 animate-pulse" aria-hidden="true" />
          )}
        </div>
      )}
    </button>
  );
}
