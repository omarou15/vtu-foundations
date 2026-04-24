/**
 * VTU — Nomenclatures (Phase 2 It. 7 stub)
 *
 * Phase 2 It. 7 : stub qui retourne []. Aucune nomenclature codée en dur
 * pour l'instant — la doctrine VTU rejette les enums Zod figés (cf.
 * KNOWLEDGE §13). La validation des `*_value` se fait UI-only.
 *
 * Phase 2 It. 10 : chargera depuis ./{method}/{section}.ts (ex: dpe/heating.ts,
 *                  audit_energetique/envelope.ts) — fichiers TS statiques par
 *                  méthode de calcul, importés à la demande.
 *
 * Phase 4+ : chargera depuis schema_registry (entrées status='active') ou
 *            depuis config org (les organisations clientes peuvent fournir
 *            leur propre nomenclature via upload ou API).
 */

export interface NomenclatureItem {
  value: string;
  label_fr: string;
  synonyms?: string[];
}

/**
 * Renvoie les valeurs autorisées pour un champ d'une section donnée selon
 * la méthode de calcul. Stub Phase 2 It. 7 → toujours [].
 */
export function getNomenclature(
  _method: string,
  _section: string,
  _field: string,
): NomenclatureItem[] {
  return [];
}
