/**
 * VTU — Groupement par date pour la sidebar VTs.
 *
 * 4 buckets : AUJOURD'HUI / HIER / CETTE SEMAINE / PLUS ANCIEN.
 * On utilise `updated_at` (plus pertinent que created_at : reflète
 * l'activité récente du thermicien).
 */

import type { LocalVisit } from "@/shared/db";

export type DateBucket = "today" | "yesterday" | "this_week" | "older";

export const BUCKET_LABEL: Record<DateBucket, string> = {
  today: "AUJOURD'HUI",
  yesterday: "HIER",
  this_week: "CETTE SEMAINE",
  older: "PLUS ANCIEN",
};

export const BUCKET_ORDER: DateBucket[] = [
  "today",
  "yesterday",
  "this_week",
  "older",
];

/** Calcule le bucket d'une date par rapport à `now`. */
export function bucketOf(dateIso: string, now: Date = new Date()): DateBucket {
  const d = new Date(dateIso);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  // Lundi = début de "cette semaine" (locale fr).
  const startOfWeek = new Date(startOfToday);
  const dayOfWeek = startOfToday.getDay(); // 0 dim, 1 lun, ...
  const diffToMonday = (dayOfWeek + 6) % 7; // lundi → 0, dimanche → 6
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

  if (d >= startOfToday) return "today";
  if (d >= startOfYesterday) return "yesterday";
  if (d >= startOfWeek) return "this_week";
  return "older";
}

export interface VisitGroup {
  bucket: DateBucket;
  label: string;
  visits: LocalVisit[];
}

/**
 * Groupe les visites par bucket (déjà triées plus récentes en premier).
 * Les buckets vides sont omis. Conserve l'ordre des visites en entrée.
 */
export function groupVisitsByDate(
  visits: LocalVisit[],
  now: Date = new Date(),
): VisitGroup[] {
  const map = new Map<DateBucket, LocalVisit[]>();
  for (const v of visits) {
    const b = bucketOf(v.updated_at, now);
    const arr = map.get(b) ?? [];
    arr.push(v);
    map.set(b, arr);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    visits: map.get(bucket)!,
  }));
}
