/**
 * VTU — Panneau "Analyses photo" du drawer JSON.
 *
 * Affiche pour la visite courante toutes les descriptions IA produites par
 * le pipeline `describeMedia` (1 par photo). Source : Dexie
 * `attachment_ai_descriptions` joint à `attachments` pour la vignette /
 * nom de fichier. Lecture live (useLiveQuery).
 *
 * Doctrine : on n'injecte JAMAIS ces descriptions dans le `state` JSON
 * (anti-hallucination). Elles restent visibles ici pour debug + audit.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { Image as ImageIcon, FileText, ScanLine } from "lucide-react";
import { useMemo } from "react";
import { getDb } from "@/shared/db";
import type { LocalAttachment, LocalAttachmentAiDescription } from "@/shared/db/schema";

interface PhotoAnalysisPanelProps {
  visitId: string;
}

interface JoinedRow {
  desc: LocalAttachmentAiDescription;
  attachment: LocalAttachment | undefined;
  thumbUrl: string | null;
}

export function PhotoAnalysisPanel({ visitId }: PhotoAnalysisPanelProps) {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const descs = await db.attachment_ai_descriptions
      .where("visit_id")
      .equals(visitId)
      .toArray();
    // Trie : plus récent en haut.
    descs.sort((a, b) => b.created_at.localeCompare(a.created_at));

    // Dédupe par attachment_id : on garde la plus récente par attachement.
    const seen = new Set<string>();
    const latest: LocalAttachmentAiDescription[] = [];
    for (const d of descs) {
      if (seen.has(d.attachment_id)) continue;
      seen.add(d.attachment_id);
      latest.push(d);
    }

    const joined: JoinedRow[] = [];
    for (const desc of latest) {
      const attachment = await db.attachments.get(desc.attachment_id);
      const blob = await db.attachment_blobs.get(desc.attachment_id);
      let thumbUrl: string | null = null;
      if (blob?.thumbnail) {
        thumbUrl = URL.createObjectURL(blob.thumbnail);
      } else if (blob?.compressed) {
        thumbUrl = URL.createObjectURL(blob.compressed);
      }
      joined.push({ desc, attachment, thumbUrl });
    }
    return joined;
  }, [visitId], [] as JoinedRow[]);

  // Nettoyage des object URLs créés pour les vignettes.
  useMemo(() => {
    return () => {
      for (const r of data ?? []) {
        if (r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      }
    };
  }, [data]);

  if (!data) {
    return (
      <p className="font-body p-4 text-sm text-muted-foreground">
        Chargement des analyses…
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ImageIcon className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="font-body text-sm text-foreground">
          Aucune photo analysée pour cette visite.
        </p>
        <p className="font-ui text-xs text-muted-foreground">
          Les analyses détaillées apparaîtront ici dès qu'une photo sera traitée.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="photo-analysis-list">
      {data.map(({ desc, attachment, thumbUrl }) => (
        <PhotoAnalysisItem
          key={desc.id}
          desc={desc}
          attachment={attachment}
          thumbUrl={thumbUrl}
        />
      ))}
    </ul>
  );
}

interface PhotoAnalysisItemProps {
  desc: LocalAttachmentAiDescription;
  attachment: LocalAttachment | undefined;
  thumbUrl: string | null;
}

function PhotoAnalysisItem({ desc, attachment, thumbUrl }: PhotoAnalysisItemProps) {
  const description = desc.description as Record<string, unknown> | null | undefined;
  const shortCaption =
    typeof description?.short_caption === "string" ? description.short_caption : null;
  const detailed =
    typeof description?.detailed_description === "string"
      ? description.detailed_description
      : null;
  const ocr =
    typeof description?.ocr_text === "string" && description.ocr_text.trim().length > 0
      ? description.ocr_text
      : null;
  const observations = Array.isArray(description?.structured_observations)
    ? (description.structured_observations as Array<{
        section_hint?: string;
        observation?: string;
      }>)
    : [];
  const skipped = description?.skipped === true;

  // Groupage des observations par section_hint
  const observationsBySection = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const o of observations) {
      const k = o.section_hint ?? "autre";
      const v = o.observation ?? "";
      if (!v) continue;
      (map[k] ||= []).push(v);
    }
    return map;
  }, [observations]);

  return (
    <li className="px-3 py-3">
      <div className="flex gap-3">
        {/* Vignette */}
        <div className="shrink-0">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={shortCaption ?? "Photo"}
              className="h-16 w-16 rounded-md object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Contenu */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-ui text-[12px] font-semibold leading-tight text-foreground">
              {shortCaption ?? "(pas de légende)"}
            </p>
            {desc.confidence_overall != null && (
              <span
                className={[
                  "font-ui shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  desc.confidence_overall >= 0.7
                    ? "bg-primary/10 text-primary"
                    : desc.confidence_overall >= 0.4
                      ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {Math.round(desc.confidence_overall * 100)}%
              </span>
            )}
          </div>

          {attachment?.format && (
            <p className="font-ui mt-0.5 text-[10px] text-muted-foreground">
              {attachment.format} ·{" "}
              {attachment.width_px && attachment.height_px
                ? `${attachment.width_px}×${attachment.height_px}px`
                : ""}{" "}
              · {desc.provider} / {desc.model_version}
            </p>
          )}

          {skipped && (
            <p className="font-body mt-2 rounded bg-muted px-2 py-1.5 text-[11px] italic text-muted-foreground">
              Analyse différée (PDF — Phase 2.5).
            </p>
          )}

          {detailed && (
            <p className="font-body mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
              {detailed}
            </p>
          )}

          {Object.keys(observationsBySection).length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="font-ui text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observations structurées
              </p>
              {Object.entries(observationsBySection).map(([section, obs]) => (
                <div key={section} className="rounded bg-muted/40 px-2 py-1.5">
                  <p className="font-ui text-[10px] font-semibold uppercase text-primary">
                    {section}
                  </p>
                  <ul className="mt-0.5 list-disc pl-4">
                    {obs.map((o, i) => (
                      <li key={i} className="font-body text-[11px] text-foreground">
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {ocr && (
            <div className="mt-2">
              <p className="font-ui mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ScanLine className="h-3 w-3" aria-hidden="true" />
                Texte lu (OCR)
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-muted px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground">
                {ocr}
              </pre>
            </div>
          )}

          {!detailed && !ocr && Object.keys(observationsBySection).length === 0 && !skipped && (
            <p className="font-body mt-2 flex items-center gap-1 text-[11px] italic text-muted-foreground">
              <FileText className="h-3 w-3" aria-hidden="true" />
              Pas d'analyse détaillée disponible.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
