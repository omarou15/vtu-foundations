/**
 * VTU — Helpers de formatage temporel pour les messages.
 *
 * Wrappers minimaux autour de date-fns + locale fr. On garde tout
 * isolé ici pour pouvoir tester sans Date.now().
 */

import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * "il y a 2 min", "il y a 1 h", etc. — relatif à `now`.
 * Si `iso` invalide, retourne "—".
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDistanceToNow(d, { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}
