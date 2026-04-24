/**
 * VTU — Recherche normalisée pour la sidebar VTs.
 *
 * Normalise accents + casse pour matcher "Égli" → "Eglise" etc.
 * Recherche sur title + address.
 */

import type { LocalVisit } from "@/shared/db";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filterVisitsByQuery(
  visits: LocalVisit[],
  query: string,
): LocalVisit[] {
  const q = normalize(query);
  if (!q) return visits;
  return visits.filter((v) => {
    const haystack = normalize(`${v.title} ${v.address ?? ""}`);
    return haystack.includes(q);
  });
}
