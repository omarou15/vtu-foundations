/**
 * Sérialisation déterministe (clés triées récursivement) pour :
 *  - Hash stable du context bundle (audit trail).
 *  - Caching prompt côté Gemini (mêmes bytes en entrée → cache hit).
 *
 * Important : on ne touche PAS aux ordres de tableaux (significatif :
 * messages chronologiques, observations IA). On trie uniquement les clés
 * d'objets.
 */

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}
