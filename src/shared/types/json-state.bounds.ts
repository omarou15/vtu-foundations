/**
 * VTU — Bornes physiques pour le JSON state (KNOWLEDGE §12)
 *
 * RÈGLE NON NÉGOCIABLE : ces bornes rejettent UNIQUEMENT les hallucinations
 * IA physiquement impossibles (année 3024, surface négative, efficacité 150%).
 * Elles ne doivent JAMAIS refuser un bâtiment français réel, y compris :
 *   - Tour Montparnasse (59 niveaux)
 *   - Campus Energyco (~150 000 m²)
 *   - Chaufferies collectives (1-5 MW)
 *   - Monuments historiques (cathédrales, chapelle XIIe siècle, an 1100)
 *   - Ballons tertiaires 200-500 m³
 *
 * Quand un nouveau champ numérique est ajouté au JSON state, le contributeur
 * DOIT se poser : "est-ce que ma borne max refuse un cas réel qu'un thermicien
 * peut rencontrer en France ?". Si oui, retirer la borne max.
 *
 * Pas de borne max sur surfaces, puissances, comptages → les valeurs aberrantes
 * sont signalées par l'IA via `confidence: "low"`, pas rejetées par Zod.
 */

import { z } from "zod";

/**
 * Borne année évaluée à RUNTIME (en 2027 la borne max s'ajuste seule).
 *
 * @param min  Année minimale acceptée (ex: -500 pour les monuments antiques,
 *             1800 pour les équipements modernes).
 * @param offsetMax  Marge en années par rapport à l'année courante (défaut 2 :
 *             un permis de construire peut viser N+2).
 */
export const makeYearBound = (
  min: number,
  offsetMax: number = 2,
): z.ZodNumber =>
  z.number().int().min(min).max(new Date().getFullYear() + offsetMax);

/** Pourcentage physique : 0% à 100%. Au-delà = hallucination. */
export const EFFICIENCY_PCT_BOUND = z.number().min(0).max(100);

/** Surface, puissance, etc. : strictement positif, pas de borne max. */
export const POSITIVE_NUMBER = z.number().positive();

/** Comptages (niveaux, logements, équipements) : entier ≥ 0. Pas de borne max. */
export const NON_NEGATIVE_INT = z.number().int().nonnegative();
