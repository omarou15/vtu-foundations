/**
 * VTU — Nomenclature canonique 3CL DPE (méthode officielle ADEME)
 * ===============================================================
 *
 * Source primaire : Project Knowledge Energyco — base RAG DPE
 *   - 06b_3cl_xml_enumerations.md     → énums XML DPE v2.6 officielles
 *   - 06b_3cl_sorties_tables_lookup.md → tv.js (tables réglementaires)
 *   - 17a_dpe_tables_enveloppe.md     → tables U parois/menuiseries
 *   - 17b_dpe_tables_systemes.md      → tables rendements systèmes
 *   - 17c_dpe_tables_resultats.md     → seuils étiquettes A-G
 *   - 17d_dpe_tables_methodo.md       → coefficients méthodo
 *   - 08b_vitrage.md                  → tables Ug/Uw/Uporte/deltar
 *   - 06a_dpewin_donnees_admin_techniques.md → zone clim ↔ département
 *   - 18a_th_bat_materiaux_isolation.md → λ Th-Bât isolants
 *   - 18e_sia_conductivites_isolants.md → λ SIA isolants (cross-check)
 *   - 04a_dpe_etiquettes_methode_3cl.md → 5 postes, étiquettes
 *   - reference_3cl_ia.md             → vue d'ensemble pipeline
 *
 * Référentiel externe :
 *   - Arrêté du 31/03/2021 modifié (méthode 3CL-DPE 2021)
 *   - Arrêté du 25/03/2024 (Sref + seuils petites surfaces, en vigueur 01/07/2024)
 *   - Arrêté du 13/08/2025 (Ep électricité 2,58 → 1,9 au 01/01/2026)
 *   - Schéma XML DPE v2.6 (Open3CL / observatoire-dpe.ademe.fr)
 *
 * Périmètre :
 *   DPE logements 3CL 2021 — maisons individuelles, appartements,
 *   immeubles collectifs d'habitation. Hors scope tertiaire (méthode
 *   différente, voir nomenclature dédiée).
 *
 * Doctrine VTU :
 *   - Liste FERMÉE : si Gemini ne match aucun code → custom_field via
 *     Schema Registry, jamais d'ajout silencieux.
 *   - Codes en snake_case ASCII pur (sans accents).
 *   - Labels FR avec accents propres.
 *   - Synonyms = mots-clés terrain (notes thermicien).
 *   - Cohérence cross-nomenclature : codes pathologies réutilisés
 *     depuis pppt_systemes.ts (références par string, pas d'import).
 *   - Énums officielles ADEME : champ `ademe_id` typé string (XML DPE
 *     manipule des strings, pas des numbers — piège tv.js documenté).
 *   - Cross-référence VENTILATION : voir VENTILATION_TYPES_3CL +
 *     champ `pppt_ref` pointant vers code PPPT homologue.
 *
 * Conventions de champs :
 *   - `ademe_code`     : libellé/code lisible ADEME
 *   - `ademe_id`       : ID énum XML DPE (string, ex: "2", "H1a")
 *   - `lambda_w_mk`    : λ conductivité isolant (W/m·K)
 *   - `uw_w_m2k`       : U fenêtre complète (W/m²·K)
 *   - `ug_w_m2k`       : U vitrage seul (W/m²·K)
 *   - `uporte_w_m2k`   : U porte (W/m²·K)
 *   - `u_typique_w_m2k`: U mur/plancher non isolé (indicatif)
 *   - `epaisseur_typique_cm`     : épaisseur courante terrain France
 *   - `typical_lifespan_years`   : durée de vie technique typique
 *   - `common_pathologies`       : codes pathologies (cross-réf PPPT)
 *   - `calcule_par_3cl`          : false si attribut hors moteur 3CL
 *
 * Date : 2026-04-26
 * Auteur : Energyco (Omar) + assistant RAG
 */

// ============================================================================
// 1. ENVELOPPE — STRUCTURE
// ============================================================================

// ----------------------------------------------------------------------------
// 1.1  MUR_TYPES — Matériaux de structure mur porteur
// ----------------------------------------------------------------------------
// Source : 06a_dpewin_3cl_enveloppe_metre.md (U0 typiques) + énum
// enum_materiaux_structure_mur_id du XML DPE v2.6.
// Les U0 sont les valeurs nues (sans isolation), à corriger ensuite par
// la fonction tv('umur', {periode, zone_clim, effet_joule}) si l'utilisateur
// déclare une isolation forfaitaire selon période.
// ----------------------------------------------------------------------------

export const MUR_TYPES = [
  {
    code: "beton_plein",
    label_fr: "Béton plein",
    synonyms: ["béton banché", "voile béton", "béton coulé", "BA"],
    ademe_code: "Béton plein",
    epaisseur_typique_cm: 18,
    u_typique_w_m2k: 3.0,
    typical_lifespan_years: 100,
    common_pathologies: ["fissure_structurelle", "carbonatation_beton", "pont_thermique_dalle"],
  },
  {
    code: "beton_banche_avec_isolant_integre",
    label_fr: "Béton banché avec isolant intégré (sandwich)",
    synonyms: ["sandwich préfabriqué", "panneau sandwich béton", "mur double peau"],
    ademe_code: "Mur en béton banché avec isolant intégré",
    epaisseur_typique_cm: 30,
    u_typique_w_m2k: 0.5,
    typical_lifespan_years: 80,
    common_pathologies: ["pont_thermique_significatif"],
  },
  {
    code: "parpaing_creux",
    label_fr: "Parpaing creux (bloc béton)",
    synonyms: ["agglo", "agglos creux", "bloc ciment", "parpaings"],
    ademe_code: "Bloc béton creux (parpaing)",
    epaisseur_typique_cm: 20,
    u_typique_w_m2k: 2.4,
    typical_lifespan_years: 80,
    common_pathologies: ["pont_thermique_significatif", "fissure_superficielle"],
  },
  {
    code: "parpaing_plein",
    label_fr: "Parpaing plein (bloc béton plein)",
    synonyms: ["agglo plein", "bloc plein"],
    ademe_code: "Bloc béton plein",
    epaisseur_typique_cm: 20,
    u_typique_w_m2k: 3.2,
    typical_lifespan_years: 80,
  },
  {
    code: "brique_creuse",
    label_fr: "Brique creuse",
    synonyms: ["brique terre cuite creuse", "brique alvéolaire", "brique 20"],
    ademe_code: "Brique creuse",
    epaisseur_typique_cm: 20,
    u_typique_w_m2k: 1.6,
    typical_lifespan_years: 100,
  },
  {
    code: "brique_pleine",
    label_fr: "Brique pleine",
    synonyms: ["brique terre cuite pleine", "brique massive", "brique foraine"],
    ademe_code: "Brique pleine",
    epaisseur_typique_cm: 22,
    u_typique_w_m2k: 2.2,
    typical_lifespan_years: 150,
  },
  {
    code: "monomur_terre_cuite",
    label_fr: "Monomur terre cuite",
    synonyms: ["brique monomur", "monomur", "brique alvéolaire isolante"],
    ademe_code: "Monomur en terre cuite",
    epaisseur_typique_cm: 37,
    u_typique_w_m2k: 0.4,
    typical_lifespan_years: 100,
  },
  {
    code: "beton_cellulaire",
    label_fr: "Béton cellulaire",
    synonyms: ["béton aéré", "ytong", "siporex", "thermopierre"],
    ademe_code: "Béton cellulaire",
    epaisseur_typique_cm: 25,
    u_typique_w_m2k: 0.45,
    typical_lifespan_years: 80,
  },
  {
    code: "ossature_bois",
    label_fr: "Ossature bois",
    synonyms: ["MOB", "maison ossature bois", "ossature légère bois"],
    ademe_code: "Ossature en bois",
    epaisseur_typique_cm: 15,
    u_typique_w_m2k: 0.5,
    typical_lifespan_years: 80,
    common_pathologies: ["humidite_ascensionnelle", "champignons_xylophages"],
  },
  {
    code: "pan_de_bois_torchis",
    label_fr: "Pan de bois (torchis, colombage)",
    synonyms: ["colombage", "torchis", "pan de bois", "maison à pans de bois"],
    ademe_code: "Pan de bois (torchis)",
    epaisseur_typique_cm: 15,
    u_typique_w_m2k: 2.0,
    typical_lifespan_years: 200,
    common_pathologies: ["humidite_ascensionnelle", "fissure_superficielle"],
  },
  {
    code: "pierre_de_taille",
    label_fr: "Pierre de taille",
    synonyms: ["pierre", "moellons taille", "pierre massive"],
    ademe_code: "Pierre de taille",
    epaisseur_typique_cm: 50,
    u_typique_w_m2k: 2.2,
    typical_lifespan_years: 200,
    common_pathologies: ["humidite_ascensionnelle", "salpetre_efflorescences"],
  },
  {
    code: "moellons_pierre",
    label_fr: "Moellons (maçonnerie de pierre tout-venant)",
    synonyms: ["moellons", "maçonnerie pierre", "tout-venant pierre", "pierre meulière"],
    ademe_code: "Moellons en pierre",
    epaisseur_typique_cm: 50,
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 200,
    common_pathologies: ["humidite_ascensionnelle", "salpetre_efflorescences", "fissure_superficielle"],
  },
  {
    code: "pise_terre_crue",
    label_fr: "Pisé / terre crue",
    synonyms: ["pisé", "terre crue", "bauge", "adobe"],
    ademe_code: "Pisé (terre crue)",
    epaisseur_typique_cm: 50,
    u_typique_w_m2k: 1.5,
    typical_lifespan_years: 200,
    common_pathologies: ["humidite_ascensionnelle", "erosion_pied_mur"],
  },
  {
    code: "metal_bardage",
    label_fr: "Métal (bardage métallique)",
    synonyms: ["bardage acier", "bac acier", "panneau métallique"],
    ademe_code: "Bardage métallique",
    epaisseur_typique_cm: 8,
    u_typique_w_m2k: 5.0,
    typical_lifespan_years: 50,
  },
  {
    code: "mur_inconnu_forfait",
    label_fr: "Matériau inconnu (forfait par période)",
    synonyms: ["inconnu", "non identifiable", "forfait période"],
    ademe_code: "Inconnu — forfait selon période de construction",
    calcule_par_3cl: true,
  },
] as const;

export type MurCode = typeof MUR_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.2  MUR_ISOLANT_TYPES — Isolants
// ----------------------------------------------------------------------------
// Sources λ : 18a_th_bat_materiaux_isolation.md (Th-Bât FR — référence
// réglementaire), 18e_sia_conductivites_isolants.md (SIA cross-check),
// 15e_isolation_techniques_intervention.md (synthèse familles).
// La méthode 3CL utilise principalement les valeurs forfaitaires umur via
// tv('umur', {...}) selon période/zone/effet_joule. L'épaisseur+λ permet
// néanmoins de calculer R = e/λ, puis U = 1/(Rsi + R + Rse).
//
// Position d'isolation : utiliser enum_type_isolation_id (ITI/ITE/ITR/...)
// dans MUR_ISOLATION_POSITION_TYPES ci-dessous.
// ----------------------------------------------------------------------------

export const MUR_ISOLANT_TYPES = [
  {
    code: "pse_blanc",
    label_fr: "Polystyrène expansé blanc (PSE)",
    synonyms: ["polystyrène", "EPS", "PSE blanc", "polystyrène standard"],
    ademe_code: "Polystyrène expansé",
    lambda_w_mk: 0.038,
    typical_lifespan_years: 50,
    common_pathologies: ["tassement_isolant", "rongeurs"],
  },
  {
    code: "pse_graphite",
    label_fr: "Polystyrène expansé graphité (PSE gris)",
    synonyms: ["PSE gris", "PSE graphite", "EPS graphité", "neopor"],
    ademe_code: "Polystyrène expansé graphité",
    lambda_w_mk: 0.032,
    typical_lifespan_years: 50,
  },
  {
    code: "xps",
    label_fr: "Polystyrène extrudé (XPS)",
    synonyms: ["XPS", "polystyrène extrudé", "styrofoam"],
    ademe_code: "Polystyrène extrudé",
    lambda_w_mk: 0.032,
    typical_lifespan_years: 50,
  },
  {
    code: "polyurethane_pir",
    label_fr: "Polyuréthane / PIR",
    synonyms: ["PUR", "PIR", "polyuréthane", "polyiso", "panneaux PIR"],
    ademe_code: "Polyuréthane / Polyisocyanurate",
    lambda_w_mk: 0.024,
    typical_lifespan_years: 50,
    common_pathologies: ["degradation_uv", "delamination_panneaux"],
  },
  {
    code: "laine_de_verre",
    label_fr: "Laine de verre",
    synonyms: ["LDV", "laine minérale verre", "fibre de verre", "isover"],
    ademe_code: "Laine de verre",
    lambda_w_mk: 0.035,
    typical_lifespan_years: 40,
    common_pathologies: ["tassement_isolant", "humidite_isolant"],
  },
  {
    code: "laine_de_roche",
    label_fr: "Laine de roche",
    synonyms: ["LDR", "laine minérale roche", "rockwool"],
    ademe_code: "Laine de roche",
    lambda_w_mk: 0.036,
    typical_lifespan_years: 50,
  },
  {
    code: "ouate_de_cellulose",
    label_fr: "Ouate de cellulose",
    synonyms: ["ouate", "cellulose", "papier recyclé", "soufflage cellulose"],
    ademe_code: "Ouate de cellulose",
    lambda_w_mk: 0.039,
    typical_lifespan_years: 40,
    common_pathologies: ["tassement_isolant"],
  },
  {
    code: "fibre_de_bois",
    label_fr: "Fibre de bois",
    synonyms: ["panneau fibre bois", "Steico", "Pavatex", "fibre bois rigide"],
    ademe_code: "Fibre de bois",
    lambda_w_mk: 0.040,
    typical_lifespan_years: 50,
  },
  {
    code: "chanvre",
    label_fr: "Chanvre (laine ou béton)",
    synonyms: ["laine de chanvre", "béton de chanvre", "hempcrete"],
    ademe_code: "Chanvre",
    lambda_w_mk: 0.044,
    typical_lifespan_years: 50,
  },
  {
    code: "liege",
    label_fr: "Liège expansé",
    synonyms: ["liège", "liège noir", "ICB"],
    ademe_code: "Liège expansé",
    lambda_w_mk: 0.042,
    typical_lifespan_years: 80,
  },
  {
    code: "laine_de_mouton",
    label_fr: "Laine de mouton",
    synonyms: ["laine mouton", "isolation animale"],
    ademe_code: "Laine de mouton",
    lambda_w_mk: 0.040,
    typical_lifespan_years: 30,
  },
  {
    code: "verre_cellulaire",
    label_fr: "Verre cellulaire (Foamglas)",
    synonyms: ["foamglas", "verre cellulaire", "verre mousse"],
    ademe_code: "Verre cellulaire",
    lambda_w_mk: 0.045,
    typical_lifespan_years: 80,
  },
  {
    code: "perlite_vermiculite",
    label_fr: "Perlite / Vermiculite",
    synonyms: ["perlite", "vermiculite", "isolant minéral en vrac"],
    ademe_code: "Perlite expansée / Vermiculite",
    lambda_w_mk: 0.060,
    typical_lifespan_years: 50,
  },
  {
    code: "isolant_inconnu_forfait",
    label_fr: "Isolant inconnu (forfait selon période)",
    synonyms: ["inconnu", "non identifiable"],
    ademe_code: "Inconnu — forfait selon période d'isolation",
    calcule_par_3cl: true,
  },
] as const;

export type MurIsolantCode = typeof MUR_ISOLANT_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.3  MUR_ISOLATION_POSITION_TYPES — Position de l'isolation
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_type_isolation_id (1-5)
// CRITIQUE : ces IDs sont des STRINGS dans tv.js et le XML DPE v2.6.
// ----------------------------------------------------------------------------

export const MUR_ISOLATION_POSITION_TYPES = [
  {
    code: "non_isole",
    label_fr: "Non isolé",
    synonyms: ["sans isolation", "brut", "non isolé"],
    ademe_id: "1",
  },
  {
    code: "iti_isolation_interieure",
    label_fr: "Isolation thermique par l'intérieur (ITI)",
    synonyms: ["ITI", "isolation intérieure", "doublage intérieur", "doublage placo+isolant"],
    ademe_id: "2",
  },
  {
    code: "ite_isolation_exterieure",
    label_fr: "Isolation thermique par l'extérieur (ITE)",
    synonyms: ["ITE", "isolation extérieure", "ETICS", "bardage isolé", "façade isolée"],
    ademe_id: "3",
  },
  {
    code: "itr_isolation_repartie",
    label_fr: "Isolation thermique répartie (ITR)",
    synonyms: ["ITR", "monomur isolant", "mur isolant intégré", "béton cellulaire isolant"],
    ademe_id: "4",
  },
  {
    code: "isolation_inconnue_forfait",
    label_fr: "Isolation inconnue (forfait selon période)",
    synonyms: ["inconnue", "non identifiable", "forfait"],
    ademe_id: "5",
  },
] as const;

export type MurIsolationPositionCode = typeof MUR_ISOLATION_POSITION_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.4  PLANCHER_BAS_TYPES — Planchers bas
// ----------------------------------------------------------------------------
// Source : 06a_dpewin_3cl_enveloppe_metre.md (U0 typiques par type) +
// XML DPE → enum_type_plancher_bas_id + enum_type_adjacence_id séparé.
// Note : pour terre-plein, le moteur 3CL utilise tv('ue', ...) qui dépend
// du périmètre (2S/P) et non pas seulement du Upb.
// ----------------------------------------------------------------------------

export const PLANCHER_BAS_TYPES = [
  {
    code: "dalle_beton_terre_plein",
    label_fr: "Dalle béton sur terre-plein",
    synonyms: ["dalle TP", "dalle sur sol", "dalle pleine sur terre", "RDC dalle pleine"],
    ademe_code: "Dalle béton sur terre-plein",
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 100,
  },
  {
    code: "dalle_beton_sur_vide_sanitaire",
    label_fr: "Dalle béton sur vide sanitaire",
    synonyms: ["VS", "vide sanitaire", "dalle sur VS", "plancher sur VS"],
    ademe_code: "Plancher sur vide sanitaire",
    u_typique_w_m2k: 2.0,
    typical_lifespan_years: 100,
  },
  {
    code: "hourdis_beton_sur_vide_sanitaire",
    label_fr: "Plancher hourdis béton sur vide sanitaire",
    synonyms: ["hourdis béton VS", "entrevous béton VS", "poutrelles hourdis béton"],
    ademe_code: "Plancher hourdis béton sur VS",
    u_typique_w_m2k: 1.8,
    typical_lifespan_years: 80,
  },
  {
    code: "hourdis_beton_sur_cave",
    label_fr: "Plancher hourdis béton sur cave / local non chauffé",
    synonyms: ["hourdis sur cave", "plancher sur cave", "dalle sur sous-sol", "LNC sous-jacent"],
    ademe_code: "Plancher hourdis béton sur local non chauffé",
    u_typique_w_m2k: 1.7,
    typical_lifespan_years: 80,
  },
  {
    code: "hourdis_polystyrene",
    label_fr: "Plancher hourdis avec entrevous polystyrène",
    synonyms: ["entrevous PSE", "hourdis isolant", "rector isolant", "polystyrène moulé entrevous"],
    ademe_code: "Plancher hourdis avec entrevous polystyrène",
    u_typique_w_m2k: 0.6,
    typical_lifespan_years: 80,
  },
  {
    code: "dalle_beton_sur_local_non_chauffe",
    label_fr: "Dalle béton sur local non chauffé (parking, hall, garage)",
    synonyms: ["sur LNC", "sur garage", "sur parking", "sur hall non chauffé"],
    ademe_code: "Dalle sur local non chauffé",
    u_typique_w_m2k: 2.2,
    typical_lifespan_years: 80,
  },
  {
    code: "dalle_beton_sur_exterieur",
    label_fr: "Dalle béton sur extérieur (porche, passage, encorbellement)",
    synonyms: ["plancher sur ext", "dalle sur porche", "encorbellement", "dalle en saillie"],
    ademe_code: "Plancher sur extérieur",
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 80,
    common_pathologies: ["pont_thermique_significatif"],
  },
  {
    code: "plancher_bois_sur_vide_sanitaire",
    label_fr: "Plancher bois sur vide sanitaire",
    synonyms: ["plancher bois VS", "lambourdes sur VS", "plancher bois ancien"],
    ademe_code: "Plancher bois sur VS",
    u_typique_w_m2k: 2.0,
    typical_lifespan_years: 80,
    common_pathologies: ["champignons_xylophages", "humidite_ascensionnelle"],
  },
  {
    code: "plancher_bois_sur_cave",
    label_fr: "Plancher bois sur cave / local non chauffé",
    synonyms: ["plancher bois sur cave", "plancher solivage cave"],
    ademe_code: "Plancher bois sur local non chauffé",
    u_typique_w_m2k: 1.8,
    typical_lifespan_years: 80,
    common_pathologies: ["champignons_xylophages"],
  },
  {
    code: "plancher_metallique",
    label_fr: "Plancher métallique (poutrelles I + briques)",
    synonyms: ["plancher fer", "poutrelles I", "plancher acier ancien", "voûtains"],
    ademe_code: "Plancher métallique",
    u_typique_w_m2k: 2.8,
    typical_lifespan_years: 100,
  },
  {
    code: "plancher_inconnu_forfait",
    label_fr: "Plancher bas inconnu (forfait selon période)",
    synonyms: ["inconnu", "non identifiable"],
    ademe_code: "Inconnu — forfait selon période",
    calcule_par_3cl: true,
  },
] as const;

export type PlancherBasCode = typeof PLANCHER_BAS_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.5  PLANCHER_HAUT_TYPES — Planchers hauts / toitures
// ----------------------------------------------------------------------------
// Source : 06a_dpewin_3cl_enveloppe_metre.md, XML DPE → enum_type_plancher_haut_id
// + enum_type_toiture_id pour comble aménagé / perdu.
// ----------------------------------------------------------------------------

export const PLANCHER_HAUT_TYPES = [
  {
    code: "combles_perdus_plafond_sous_combles",
    label_fr: "Plafond sous combles perdus",
    synonyms: ["combles perdus", "comble froid", "grenier non chauffé", "plafond grenier"],
    ademe_code: "Plafond sous combles perdus",
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 80,
  },
  {
    code: "combles_amenages_rampants",
    label_fr: "Rampants de combles aménagés",
    synonyms: ["combles aménagés", "rampants", "sous-toiture", "couverture chauffée"],
    ademe_code: "Rampants de toiture (combles aménagés)",
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 80,
  },
  {
    code: "toiture_terrasse_beton",
    label_fr: "Toiture-terrasse béton",
    synonyms: ["TT", "toit-terrasse", "toiture plate béton", "dalle de couverture"],
    ademe_code: "Toiture-terrasse béton",
    u_typique_w_m2k: 2.3,
    typical_lifespan_years: 50,
    common_pathologies: ["etancheite_toiture_degradee", "stagnation_eau_toiture"],
  },
  {
    code: "toiture_terrasse_legere",
    label_fr: "Toiture-terrasse légère (bac acier, bois)",
    synonyms: ["TT légère", "bac acier toiture", "toiture bois plate", "toit plat léger"],
    ademe_code: "Toiture-terrasse en éléments légers",
    u_typique_w_m2k: 1.8,
    typical_lifespan_years: 40,
  },
  {
    code: "plancher_haut_sur_local_non_chauffe",
    label_fr: "Plancher haut sur local non chauffé (LNC sus-jacent)",
    synonyms: ["plafond sur LNC", "plancher sous LNC", "comble non chauffé sup."],
    ademe_code: "Plancher haut sur LNC",
    u_typique_w_m2k: 1.8,
    typical_lifespan_years: 80,
  },
  {
    code: "plancher_intermediaire_sur_exterieur",
    label_fr: "Plancher haut sur extérieur (encorbellement, dernier étage saillant)",
    synonyms: ["plancher sur ext", "encorbellement haut", "saillie supérieure"],
    ademe_code: "Plancher haut sur extérieur",
    u_typique_w_m2k: 2.5,
    typical_lifespan_years: 80,
  },
  {
    code: "toiture_chaume",
    label_fr: "Toiture en chaume",
    synonyms: ["chaume", "toit de chaume", "couverture végétale"],
    ademe_code: "Toiture en chaume",
    u_typique_w_m2k: 0.7,
    typical_lifespan_years: 40,
  },
  {
    code: "plancher_haut_inconnu_forfait",
    label_fr: "Plancher haut inconnu (forfait selon période)",
    synonyms: ["inconnu", "non identifiable"],
    ademe_code: "Inconnu — forfait selon période",
    calcule_par_3cl: true,
  },
] as const;

export type PlancherHautCode = typeof PLANCHER_HAUT_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.6  MENUISERIE_VITRAGE_TYPES — Types de vitrage
// ----------------------------------------------------------------------------
// Source : 08b_vitrage.md (Tables Ug officielles) + XML DPE
// → enum_type_vitrage_id (string, 1-5).
// Ug = vitrage seul, à composer ensuite avec menuiserie pour Uw.
// ----------------------------------------------------------------------------

export const MENUISERIE_VITRAGE_TYPES = [
  {
    code: "simple_vitrage",
    label_fr: "Simple vitrage",
    synonyms: ["SV", "simple vitrage", "vitrage simple", "verre simple"],
    ademe_id: "1",
    ademe_code: "Simple vitrage",
    ug_w_m2k: 5.8,
    uw_w_m2k: 4.8, // Uw typique avec menuiserie PVC ou bois
  },
  {
    code: "double_vitrage_air_avant_1990",
    label_fr: "Double vitrage air, lame fine (avant 1990)",
    synonyms: ["DV ancien", "DV 4/6/4", "DV 4/8/4", "DV intercalaire alu", "DV avant 90"],
    ademe_id: "2",
    ademe_code: "Double vitrage standard (air, lame fine)",
    ug_w_m2k: 3.3,
    uw_w_m2k: 3.0,
  },
  {
    code: "double_vitrage_air_apres_1990",
    label_fr: "Double vitrage air, lame épaisse (1990-2000)",
    synonyms: ["DV 4/12/4 air", "DV 4/16/4 air", "DV intercalaire alu 90s"],
    ademe_id: "2",
    ademe_code: "Double vitrage standard (air, lame épaisse)",
    ug_w_m2k: 2.7,
    uw_w_m2k: 2.5,
  },
  {
    code: "double_vitrage_argon",
    label_fr: "Double vitrage argon (sans VIR)",
    synonyms: ["DV argon", "double vitrage argon", "DV gaz argon"],
    ademe_id: "2",
    ademe_code: "Double vitrage argon",
    ug_w_m2k: 2.5,
    uw_w_m2k: 2.4,
  },
  {
    code: "double_vitrage_vir_air",
    label_fr: "Double vitrage VIR (peu émissif, air)",
    synonyms: ["DV VIR air", "DV faible émissivité air", "DV peu émissif"],
    ademe_id: "4",
    ademe_code: "Double vitrage à isolation renforcée (VIR), air",
    ug_w_m2k: 1.8,
    uw_w_m2k: 1.9,
  },
  {
    code: "double_vitrage_vir_argon",
    label_fr: "Double vitrage VIR argon (warm-edge)",
    synonyms: ["DV VIR argon", "DV warm-edge", "DV ITR argon", "DV récent argon"],
    ademe_id: "4",
    ademe_code: "Double vitrage à isolation renforcée (VIR), argon",
    ug_w_m2k: 1.1,
    uw_w_m2k: 1.3,
  },
  {
    code: "double_vitrage_vir_krypton",
    label_fr: "Double vitrage VIR krypton (haute performance)",
    synonyms: ["DV VIR krypton", "DV gaz krypton", "DV très performant"],
    ademe_id: "4",
    ademe_code: "Double vitrage à isolation renforcée (VIR), krypton",
    ug_w_m2k: 0.7,
    uw_w_m2k: 1.0,
  },
  {
    code: "triple_vitrage_argon",
    label_fr: "Triple vitrage argon (standard)",
    synonyms: ["TV argon", "triple vitrage argon", "TV standard"],
    ademe_id: "3",
    ademe_code: "Triple vitrage standard (argon)",
    ug_w_m2k: 1.6,
    uw_w_m2k: 1.7,
  },
  {
    code: "triple_vitrage_vir_argon",
    label_fr: "Triple vitrage VIR argon",
    synonyms: ["TV VIR argon", "TV peu émissif argon"],
    ademe_id: "5",
    ademe_code: "Triple vitrage à isolation renforcée (VIR), argon",
    ug_w_m2k: 0.8,
    uw_w_m2k: 1.0,
  },
  {
    code: "triple_vitrage_vir_krypton",
    label_fr: "Triple vitrage VIR krypton (très haute performance)",
    synonyms: ["TV VIR krypton", "TV haute performance"],
    ademe_id: "5",
    ademe_code: "Triple vitrage à isolation renforcée (VIR), krypton",
    ug_w_m2k: 0.5,
    uw_w_m2k: 0.8,
  },
  {
    code: "survitrage",
    label_fr: "Survitrage (double fenêtre)",
    synonyms: ["survitrage", "double fenêtre", "fenêtre + contre-fenêtre"],
    ademe_code: "Survitrage / double fenêtre",
    // Uw_équiv = 1 / (1/Uw1 + 1/Uw2 + 0.07) — calculé au cas par cas
    uw_w_m2k: 1.7,
  },
] as const;

export type MenuiserieVitrageCode = typeof MENUISERIE_VITRAGE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.7  MENUISERIE_DORMANT_TYPES — Matériau du cadre/dormant
// ----------------------------------------------------------------------------
// Source : 08b_vitrage.md → enum_type_menuiserie_id (string, 1-5)
// ----------------------------------------------------------------------------

export const MENUISERIE_DORMANT_TYPES = [
  {
    code: "pvc",
    label_fr: "PVC",
    synonyms: ["PVC", "polychlorure", "menuiserie PVC", "fenêtre PVC"],
    ademe_id: "1",
    ademe_code: "PVC",
    typical_lifespan_years: 30,
  },
  {
    code: "bois",
    label_fr: "Bois (ou PVC + bois)",
    synonyms: ["bois", "menuiserie bois", "fenêtre bois", "chêne", "résineux", "mixte PVC-bois"],
    ademe_id: "2",
    ademe_code: "Bois ou PVC + bois",
    typical_lifespan_years: 50,
    common_pathologies: ["humidite_isolant", "champignons_xylophages"],
  },
  {
    code: "alu_sans_rupteur",
    label_fr: "Aluminium sans rupteur de pont thermique",
    synonyms: ["alu sans rupteur", "alu froid", "alu ancien", "menuiserie alu non isolée"],
    ademe_id: "3",
    ademe_code: "Aluminium sans rupteur de pont thermique",
    typical_lifespan_years: 50,
    common_pathologies: ["pont_thermique_significatif", "condensation_vapeur"],
  },
  {
    code: "alu_avec_rupteur",
    label_fr: "Aluminium avec rupteur de pont thermique",
    synonyms: ["alu rupteur", "alu RPT", "alu thermolaqué isolé"],
    ademe_id: "4",
    ademe_code: "Aluminium avec rupteur de pont thermique",
    typical_lifespan_years: 50,
  },
  {
    code: "alu_rupteur_renforce",
    label_fr: "Aluminium avec rupteur de pont thermique renforcé",
    synonyms: ["alu rupteur renforcé", "alu haute performance", "alu RPT++"],
    ademe_id: "5",
    ademe_code: "Aluminium avec rupteur de pont thermique renforcé",
    typical_lifespan_years: 50,
  },
  {
    code: "mixte_bois_alu",
    label_fr: "Mixte bois-aluminium (capot alu extérieur)",
    synonyms: ["mixte bois-alu", "bois-alu", "bois capot alu"],
    ademe_id: "2",
    ademe_code: "Bois ou PVC + bois (mixte bois-alu)",
    typical_lifespan_years: 50,
  },
  {
    code: "acier",
    label_fr: "Acier (menuiserie métallique)",
    synonyms: ["acier", "menuiserie acier", "huisserie métal"],
    ademe_id: "3",
    ademe_code: "Métal (assimilé alu sans rupteur)",
    typical_lifespan_years: 60,
  },
] as const;

export type MenuiserieDormantCode = typeof MENUISERIE_DORMANT_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.8  MENUISERIE_TYPE_OUVRANT_TYPES — Mode d'ouverture
// ----------------------------------------------------------------------------
// Note : 3CL ne pondère pas le calcul thermique selon le mode d'ouvrant.
// Champ informatif (Schema Registry / VTU), `calcule_par_3cl: false`.
// ----------------------------------------------------------------------------

export const MENUISERIE_TYPE_OUVRANT_TYPES = [
  {
    code: "battant",
    label_fr: "Ouvrant à la française (battant)",
    synonyms: ["battant", "française", "à frapper"],
    calcule_par_3cl: false,
  },
  {
    code: "oscillo_battant",
    label_fr: "Oscillo-battant",
    synonyms: ["oscillo-battant", "OB", "soufflet"],
    calcule_par_3cl: false,
  },
  {
    code: "coulissant",
    label_fr: "Coulissant",
    synonyms: ["coulissant", "baie coulissante", "à galandage"],
    calcule_par_3cl: false,
  },
  {
    code: "fixe",
    label_fr: "Châssis fixe",
    synonyms: ["fixe", "châssis fixe", "non ouvrant"],
    calcule_par_3cl: false,
  },
  {
    code: "soufflet_basculant",
    label_fr: "Soufflet / basculant (impostes)",
    synonyms: ["soufflet", "basculant", "imposte"],
    calcule_par_3cl: false,
  },
] as const;

export type MenuiserieTypeOuvrantCode = typeof MENUISERIE_TYPE_OUVRANT_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.9  PORTE_TYPES — Portes extérieures et palières
// ----------------------------------------------------------------------------
// Source : 08b_vitrage.md → table Uporte (10 types) + enum_type_porte_id
// ----------------------------------------------------------------------------

export const PORTE_TYPES = [
  {
    code: "porte_opaque_bois",
    label_fr: "Porte opaque en bois",
    synonyms: ["porte bois pleine", "porte bois ancienne", "porte chêne"],
    ademe_id: "1",
    ademe_code: "Porte opaque en bois",
    uporte_w_m2k: 3.0,
    typical_lifespan_years: 50,
  },
  {
    code: "porte_opaque_isolee",
    label_fr: "Porte opaque isolée (âme polystyrène/PSE)",
    synonyms: ["porte isolée", "porte âme PSE", "porte tiercée isolée"],
    ademe_id: "2",
    ademe_code: "Porte opaque isolée",
    uporte_w_m2k: 2.0,
    typical_lifespan_years: 40,
  },
  {
    code: "porte_opaque_tres_isolee",
    label_fr: "Porte opaque très isolée",
    synonyms: ["porte très isolée", "porte HP", "porte âme PUR"],
    ademe_id: "3",
    ademe_code: "Porte opaque très isolée",
    uporte_w_m2k: 1.5,
    typical_lifespan_years: 40,
  },
  {
    code: "porte_pvc_alu_rupteur",
    label_fr: "Porte PVC ou aluminium avec rupteur",
    synonyms: ["porte PVC", "porte alu rupteur", "porte PVC moderne"],
    ademe_id: "4",
    ademe_code: "Porte PVC ou aluminium avec rupteur",
    uporte_w_m2k: 2.0,
    typical_lifespan_years: 40,
  },
  {
    code: "porte_vitree_inf_30",
    label_fr: "Porte avec vitrage ≤ 30%",
    synonyms: ["porte vitrée partielle", "porte avec hublot"],
    ademe_id: "5",
    ademe_code: "Porte avec vitrage ≤ 30%",
    uporte_w_m2k: 3.0,
    typical_lifespan_years: 40,
  },
  {
    code: "porte_vitree_30_60",
    label_fr: "Porte avec vitrage 30-60%",
    synonyms: ["porte semi-vitrée", "porte mi-vitrée"],
    ademe_id: "6",
    ademe_code: "Porte avec vitrage 30-60%",
    uporte_w_m2k: 3.5,
    typical_lifespan_years: 40,
  },
  {
    code: "porte_fenetre_vitree_sup_60",
    label_fr: "Porte-fenêtre (vitrage > 60%) — traiter en baie vitrée",
    synonyms: ["porte-fenêtre", "PF vitrée", "baie vitrée porte"],
    ademe_id: "7",
    ademe_code: "Porte vitrage > 60% → traiter en porte-fenêtre (Uw)",
    typical_lifespan_years: 40,
    calcule_par_3cl: true, // Mais via Uw, pas Uporte
  },
  {
    code: "porte_garage_basculante_non_isolee",
    label_fr: "Porte de garage basculante non isolée",
    synonyms: ["porte garage basculante", "porte garage tôle", "porte garage simple"],
    ademe_id: "8",
    ademe_code: "Porte de garage basculante non isolée",
    uporte_w_m2k: 3.5,
    typical_lifespan_years: 30,
  },
  {
    code: "porte_garage_sectionnelle_isolee",
    label_fr: "Porte de garage sectionnelle isolée",
    synonyms: ["porte garage sectionnelle", "porte garage isolée", "porte sectionnelle"],
    ademe_id: "9",
    ademe_code: "Porte de garage sectionnelle isolée",
    uporte_w_m2k: 2.0,
    typical_lifespan_years: 30,
  },
  {
    code: "porte_blindee",
    label_fr: "Porte blindée (palière sécurisée)",
    synonyms: ["porte blindée", "porte sécurisée", "porte palière blindée"],
    ademe_id: "2", // Assimilée porte opaque isolée
    ademe_code: "Porte blindée (assimilée porte opaque isolée)",
    uporte_w_m2k: 2.0,
    typical_lifespan_years: 50,
  },
  {
    code: "porte_inconnue_forfait",
    label_fr: "Porte inconnue (forfait)",
    synonyms: ["inconnue", "non identifiable"],
    ademe_id: "10",
    ademe_code: "Inconnue — valeur forfaitaire",
    uporte_w_m2k: 3.0,
    calcule_par_3cl: true,
  },
] as const;

export type PorteCode = typeof PORTE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.10  PROTECTION_SOLAIRE_TYPES — Volets, occultations, protections
// ----------------------------------------------------------------------------
// Source : 08b_vitrage.md → table deltar (9 types fermeture)
// + champ deltar (m²·K/W) pour calcul Ujn = 1 / (1/Uw + deltar)
// ----------------------------------------------------------------------------

export const PROTECTION_SOLAIRE_TYPES = [
  {
    code: "volet_roulant_pvc",
    label_fr: "Volet roulant PVC",
    synonyms: ["VR PVC", "volet roulant PVC", "VR plastique"],
    ademe_id: "1",
    ademe_code: "Volet roulant PVC",
    deltar_m2k_w: 0.10,
    typical_lifespan_years: 25,
  },
  {
    code: "volet_roulant_aluminium",
    label_fr: "Volet roulant aluminium",
    synonyms: ["VR alu", "volet roulant alu", "VR métal"],
    ademe_id: "2",
    ademe_code: "Volet roulant aluminium",
    deltar_m2k_w: 0.08,
    typical_lifespan_years: 30,
  },
  {
    code: "volet_roulant_bois",
    label_fr: "Volet roulant bois",
    synonyms: ["VR bois", "volet roulant bois"],
    ademe_id: "3",
    ademe_code: "Volet roulant bois",
    deltar_m2k_w: 0.12,
    typical_lifespan_years: 30,
  },
  {
    code: "volet_battant_bois_massif",
    label_fr: "Volet battant bois massif",
    synonyms: ["volet battant", "volet bois plein", "contrevent bois"],
    ademe_id: "4",
    ademe_code: "Volet battant bois massif",
    deltar_m2k_w: 0.14,
    typical_lifespan_years: 50,
  },
  {
    code: "volet_battant_persienne",
    label_fr: "Volet battant à persienne (bois)",
    synonyms: ["volet persienné", "persienne bois", "volet à lames"],
    ademe_id: "5",
    ademe_code: "Volet battant bois persienne",
    deltar_m2k_w: 0.10,
    typical_lifespan_years: 50,
  },
  {
    code: "jalousie_orientable_aluminium",
    label_fr: "Jalousie orientable aluminium",
    synonyms: ["jalousie", "store vénitien ext", "jalousie alu"],
    ademe_id: "6",
    ademe_code: "Jalousie orientable aluminium",
    deltar_m2k_w: 0.12,
    typical_lifespan_years: 25,
  },
  {
    code: "store_exterieur_toile",
    label_fr: "Store extérieur toile",
    synonyms: ["store toile", "BSO toile", "screen extérieur"],
    ademe_id: "7",
    ademe_code: "Store extérieur toile",
    deltar_m2k_w: 0.05,
    typical_lifespan_years: 15,
  },
  {
    code: "volet_interieur_bois",
    label_fr: "Volet intérieur bois",
    synonyms: ["volet intérieur", "contrevent intérieur", "volet bois int"],
    ademe_id: "8",
    ademe_code: "Volet intérieur bois",
    deltar_m2k_w: 0.05,
    typical_lifespan_years: 50,
  },
  {
    code: "brise_soleil_orientable",
    label_fr: "Brise-soleil orientable (BSO)",
    synonyms: ["BSO", "brise-soleil", "lames orientables ext"],
    ademe_id: "6",
    ademe_code: "Brise-soleil (assimilé jalousie orientable)",
    deltar_m2k_w: 0.12,
    typical_lifespan_years: 25,
  },
  {
    code: "fermeture_non_precisee",
    label_fr: "Fermeture présente non précisée",
    synonyms: ["fermeture inconnue", "volet non précisé"],
    ademe_id: "9",
    ademe_code: "Fermeture non précisée",
    deltar_m2k_w: 0.08,
    calcule_par_3cl: true,
  },
  {
    code: "aucune_fermeture",
    label_fr: "Aucune fermeture / occultation",
    synonyms: ["sans volet", "sans fermeture", "rien"],
    ademe_code: "Aucune fermeture",
    deltar_m2k_w: 0.0,
  },
] as const;

export type ProtectionSolaireCode = typeof PROTECTION_SOLAIRE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 1.11  PONT_THERMIQUE_TYPES — Catégories de ponts thermiques 3CL
// ----------------------------------------------------------------------------
// Source : 06a_dpewin_3cl_enveloppe_metre.md (table ψ par jonction et
// configuration ITI/ITE/non isolé) + tv('pont_thermique', ...)
// ----------------------------------------------------------------------------

export const PONT_THERMIQUE_TYPES = [
  {
    code: "mur_plancher_bas",
    label_fr: "Liaison mur / plancher bas",
    synonyms: ["mur plancher bas", "PT plancher bas", "PT pied de mur"],
    ademe_code: "Pont thermique mur / plancher bas",
    psi_iti_w_mk: 0.55,
    psi_ite_w_mk: 0.10,
    psi_non_isole_w_mk: 0.60,
  },
  {
    code: "mur_plancher_intermediaire",
    label_fr: "Liaison mur / plancher intermédiaire",
    synonyms: ["mur dalle", "PT dalle intermédiaire", "PT plancher d'étage"],
    ademe_code: "Pont thermique mur / plancher intermédiaire",
    psi_iti_w_mk: 0.85,
    psi_ite_w_mk: 0.10,
    psi_non_isole_w_mk: 0.90,
  },
  {
    code: "mur_plancher_haut",
    label_fr: "Liaison mur / plancher haut (acrotère, sablière)",
    synonyms: ["acrotère", "sablière", "PT toiture", "PT haut de mur"],
    ademe_code: "Pont thermique mur / plancher haut",
    psi_iti_w_mk: 0.55,
    psi_ite_w_mk: 0.10,
    psi_non_isole_w_mk: 0.60,
  },
  {
    code: "mur_refend",
    label_fr: "Liaison mur extérieur / refend",
    synonyms: ["refend", "PT refend", "PT mur intérieur porteur"],
    ademe_code: "Pont thermique mur / refend",
    psi_iti_w_mk: 0.55,
    psi_ite_w_mk: 0.05,
    psi_non_isole_w_mk: 0.55,
  },
  {
    code: "mur_menuiserie_linteau",
    label_fr: "Liaison mur / menuiserie (linteau)",
    synonyms: ["linteau", "PT linteau"],
    ademe_code: "Pont thermique mur / menuiserie (linteau)",
    psi_iti_w_mk: 0.07,
    psi_ite_w_mk: 0.04,
    psi_non_isole_w_mk: 0.07,
  },
  {
    code: "mur_menuiserie_tableau",
    label_fr: "Liaison mur / menuiserie (tableau)",
    synonyms: ["tableau fenêtre", "PT tableau"],
    ademe_code: "Pont thermique mur / menuiserie (tableau)",
    psi_iti_w_mk: 0.10,
    psi_ite_w_mk: 0.04,
    psi_non_isole_w_mk: 0.10,
  },
  {
    code: "mur_menuiserie_appui",
    label_fr: "Liaison mur / menuiserie (appui)",
    synonyms: ["appui de fenêtre", "PT appui", "tablette"],
    ademe_code: "Pont thermique mur / menuiserie (appui)",
    psi_iti_w_mk: 0.10,
    psi_ite_w_mk: 0.04,
    psi_non_isole_w_mk: 0.10,
  },
  {
    code: "balcon_porte_a_faux",
    label_fr: "Balcon en porte-à-faux (dalle traversante)",
    synonyms: ["balcon", "dalle traversante", "PT balcon"],
    ademe_code: "Balcon — dalle traversante",
    psi_iti_w_mk: 0.85,
    psi_ite_w_mk: 0.85, // Non traité sans rupteur — résiduel élevé même en ITE
    psi_non_isole_w_mk: 1.0,
    common_pathologies: ["pont_thermique_significatif", "condensation_vapeur"],
  },
  {
    code: "mur_plancher_terre_plein",
    label_fr: "Liaison mur / plancher sur terre-plein",
    synonyms: ["mur TP", "PT terre-plein"],
    ademe_code: "Pont thermique mur / plancher sur terre-plein",
    psi_iti_w_mk: 0.55,
    psi_ite_w_mk: 0.10,
    psi_non_isole_w_mk: 0.60,
  },
  {
    code: "ponts_thermiques_forfait_3cl",
    label_fr: "Ponts thermiques — calcul forfaitaire 3CL automatique",
    synonyms: ["forfait PT", "auto 3CL", "calcul automatique"],
    ademe_code: "Génération automatique 3CL (recommandé)",
    calcule_par_3cl: true,
  },
] as const;

export type PontThermiqueCode = typeof PONT_THERMIQUE_TYPES[number]["code"];

// ============================================================================
// 2. SYSTÈMES ÉNERGÉTIQUES
// ============================================================================

// ----------------------------------------------------------------------------
// 2.1  CHAUFFAGE_GENERATEUR_TYPES — Générateurs de chauffage
// ----------------------------------------------------------------------------
// Source : 06a_dpewin_3cl_systemes_bilan.md, 17b_dpe_tables_systemes.md,
// 04b_equipements_chauffage_solutions.md, dpe_guide_equipements-techniques.md
// + XML DPE → enum_type_generateur_ch_id (string)
//
// Granularité fine maintenue pour les chaudières (standard / BT / cond / THPE)
// et les PAC (air-eau / eau-eau / air-air / hybride) car le rendement Rg
// diffère significativement.
// ----------------------------------------------------------------------------

export const CHAUFFAGE_GENERATEUR_TYPES = [
  {
    code: "chaudiere_gaz_standard",
    label_fr: "Chaudière gaz standard (avant 1990)",
    synonyms: ["chaudière gaz ancienne", "chaudière standard", "chaudière atmosphérique"],
    ademe_code: "Chaudière gaz standard",
    rendement_pci_typique: 0.82,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "les_deux",
    common_pathologies: ["corrosion_echangeur", "encrassement_bruleur"],
  },
  {
    code: "chaudiere_gaz_basse_temperature",
    label_fr: "Chaudière gaz basse température (1990-2005)",
    synonyms: ["chaudière BT gaz", "chaudière basse temp gaz"],
    ademe_code: "Chaudière gaz basse température",
    rendement_pci_typique: 0.90,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_gaz_condensation",
    label_fr: "Chaudière gaz à condensation",
    synonyms: ["chaudière condensation gaz", "chaudière HPE gaz", "condensation"],
    ademe_code: "Chaudière gaz à condensation",
    rendement_pci_typique: 1.05,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_gaz_thpe",
    label_fr: "Chaudière gaz très haute performance (THPE)",
    synonyms: ["chaudière THPE", "chaudière gaz HP+", "chaudière >109%"],
    ademe_code: "Chaudière gaz THPE",
    rendement_pci_typique: 1.09,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_fioul_standard",
    label_fr: "Chaudière fioul standard",
    synonyms: ["chaudière fuel", "chaudière fioul ancien", "chaudière mazout"],
    ademe_code: "Chaudière fioul standard",
    rendement_pci_typique: 0.80,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_fioul_basse_temperature",
    label_fr: "Chaudière fioul basse température",
    synonyms: ["chaudière BT fioul"],
    ademe_code: "Chaudière fioul basse température",
    rendement_pci_typique: 0.88,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_fioul_condensation",
    label_fr: "Chaudière fioul à condensation",
    synonyms: ["chaudière fioul condensation"],
    ademe_code: "Chaudière fioul à condensation",
    rendement_pci_typique: 0.97,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_biomasse_buches",
    label_fr: "Chaudière biomasse à bûches",
    synonyms: ["chaudière bois bûches", "chaudière bûches", "chaudière à bois"],
    ademe_code: "Chaudière biomasse bûches",
    rendement_pci_typique: 0.75,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_biomasse_granules",
    label_fr: "Chaudière biomasse à granulés (pellets)",
    synonyms: ["chaudière pellets", "chaudière granulés", "chaudière à granulés bois"],
    ademe_code: "Chaudière biomasse granulés",
    rendement_pci_typique: 0.88,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "chaudiere_biomasse_plaquettes",
    label_fr: "Chaudière biomasse à plaquettes",
    synonyms: ["chaudière plaquettes", "chaudière bois déchiqueté"],
    ademe_code: "Chaudière biomasse plaquettes",
    rendement_pci_typique: 0.85,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "pac_air_eau",
    label_fr: "Pompe à chaleur air/eau",
    synonyms: ["PAC air/eau", "PAC aérothermie", "pompe à chaleur air eau"],
    ademe_code: "PAC air/eau",
    cop_typique: 3.0,
    typical_lifespan_years: 17,
    individuel_ou_collectif: "les_deux",
    common_pathologies: ["fuite_fluide_frigorigene"],
  },
  {
    code: "pac_eau_eau",
    label_fr: "Pompe à chaleur eau/eau (géothermie nappe)",
    synonyms: ["PAC eau/eau", "PAC géothermie nappe", "PAC nappe phréatique"],
    ademe_code: "PAC eau/eau",
    cop_typique: 4.5,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "pac_sol_eau_geothermie",
    label_fr: "Pompe à chaleur sol/eau (géothermie sondes)",
    synonyms: ["PAC géothermique", "PAC sondes verticales", "PAC capteurs horizontaux"],
    ademe_code: "PAC sol/eau (géothermie)",
    cop_typique: 4.0,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "pac_air_air",
    label_fr: "Pompe à chaleur air/air (climatisation réversible)",
    synonyms: ["PAC air/air", "split réversible", "clim réversible"],
    ademe_code: "PAC air/air",
    cop_typique: 3.0,
    typical_lifespan_years: 15,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "pac_hybride",
    label_fr: "PAC hybride (PAC + chaudière gaz condensation)",
    synonyms: ["PAC hybride", "système hybride", "PAC + chaudière condensation"],
    ademe_code: "PAC hybride",
    cop_typique: 2.8,
    typical_lifespan_years: 17,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "convecteur_electrique_direct",
    label_fr: "Convecteur électrique à effet Joule direct",
    synonyms: ["convecteur", "grille-pain", "radiateur électrique direct"],
    ademe_code: "Convecteur électrique direct",
    rendement_pci_typique: 1.0,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "radiateur_electrique_inertie",
    label_fr: "Radiateur électrique à inertie / rayonnant",
    synonyms: ["radiateur inertie", "radiateur fonte électrique", "panneau rayonnant", "radiateur chaleur douce"],
    ademe_code: "Radiateur électrique à inertie / rayonnant",
    rendement_pci_typique: 1.0,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "plancher_chauffant_electrique",
    label_fr: "Plancher rayonnant électrique",
    synonyms: ["PRE", "plancher chauffant élec", "plancher rayonnant électrique"],
    ademe_code: "Plancher rayonnant électrique",
    rendement_pci_typique: 1.0,
    typical_lifespan_years: 30,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "poele_buches",
    label_fr: "Poêle à bûches",
    synonyms: ["poêle bois", "poêle bûches", "poêle scandinave"],
    ademe_code: "Poêle à bûches",
    rendement_pci_typique: 0.70,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "poele_granules",
    label_fr: "Poêle à granulés (pellets)",
    synonyms: ["poêle pellets", "poêle granulés", "poêle à pellets"],
    ademe_code: "Poêle à granulés",
    rendement_pci_typique: 0.85,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "insert_foyer_ferme_buches",
    label_fr: "Insert / foyer fermé bûches",
    synonyms: ["insert", "foyer fermé", "cheminée insert"],
    ademe_code: "Insert ou foyer fermé bûches",
    rendement_pci_typique: 0.70,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "cheminee_foyer_ouvert",
    label_fr: "Cheminée à foyer ouvert",
    synonyms: ["cheminée ouverte", "foyer ouvert"],
    ademe_code: "Cheminée à foyer ouvert",
    rendement_pci_typique: 0.10,
    typical_lifespan_years: 50,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "reseau_chaleur_urbain",
    label_fr: "Réseau de chaleur urbain (RCU)",
    synonyms: ["RCU", "chauffage urbain", "réseau chaleur", "CPCU"],
    ademe_code: "Raccordement à un réseau de chaleur",
    rendement_pci_typique: 0.95, // Rendement sous-station
    typical_lifespan_years: 40,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "cogeneration",
    label_fr: "Cogénération (PAC à absorption, micro-cogé)",
    synonyms: ["cogé", "cogénération", "micro-cogé"],
    ademe_code: "Cogénération",
    rendement_pci_typique: 0.90,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "generateur_inconnu_forfait",
    label_fr: "Générateur inconnu (forfait)",
    synonyms: ["inconnu", "non identifiable"],
    ademe_code: "Inconnu — forfait selon énergie",
    calcule_par_3cl: true,
  },
] as const;

export type ChauffageGenerateurCode = typeof CHAUFFAGE_GENERATEUR_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 2.2  CHAUFFAGE_EMETTEUR_TYPES — Émetteurs de chaleur
// ----------------------------------------------------------------------------
// Source : 08d_seer.md → table Re (rendement émission) +
// 06a_dpewin_3cl_systemes_bilan.md
// ----------------------------------------------------------------------------

export const CHAUFFAGE_EMETTEUR_TYPES = [
  {
    code: "radiateur_eau_haute_temperature",
    label_fr: "Radiateur à eau haute température (>50°C)",
    synonyms: ["radiateur eau", "radiateur HT", "radiateur fonte", "radiateur acier"],
    ademe_code: "Radiateur à eau haute température",
    rendement_emission: 0.95,
    typical_lifespan_years: 50,
  },
  {
    code: "radiateur_eau_basse_temperature",
    label_fr: "Radiateur à eau basse température (≤50°C)",
    synonyms: ["radiateur BT", "radiateur basse température eau", "radiateur dimensionné PAC"],
    ademe_code: "Radiateur à eau basse température",
    rendement_emission: 0.97,
    typical_lifespan_years: 50,
  },
  {
    code: "plancher_chauffant_hydraulique",
    label_fr: "Plancher chauffant hydraulique",
    synonyms: ["PCH", "PCBT", "plancher chauffant eau", "plancher hydraulique"],
    ademe_code: "Plancher chauffant hydraulique",
    rendement_emission: 1.0,
    typical_lifespan_years: 50,
  },
  {
    code: "plafond_rayonnant_hydraulique",
    label_fr: "Plafond rayonnant hydraulique",
    synonyms: ["plafond chauffant eau", "PRH"],
    ademe_code: "Plafond rayonnant hydraulique",
    rendement_emission: 0.97,
    typical_lifespan_years: 50,
  },
  {
    code: "ventilo_convecteur_eau",
    label_fr: "Ventilo-convecteur eau (fan-coil)",
    synonyms: ["ventilo-convecteur", "fan-coil", "VC eau", "cassette eau"],
    ademe_code: "Ventilo-convecteur (fan-coil)",
    rendement_emission: 0.97,
    typical_lifespan_years: 20,
  },
  {
    code: "convecteur_electrique",
    label_fr: "Convecteur électrique avec thermostat",
    synonyms: ["convecteur élec", "grille-pain"],
    ademe_code: "Convecteur électrique avec thermostat",
    rendement_emission: 0.96,
    typical_lifespan_years: 20,
  },
  {
    code: "radiateur_electrique_inertie",
    label_fr: "Radiateur électrique à inertie",
    synonyms: ["radiateur inertie élec", "radiateur fluide caloporteur"],
    ademe_code: "Radiateur électrique à inertie",
    rendement_emission: 0.97,
    typical_lifespan_years: 20,
  },
  {
    code: "panneau_rayonnant_electrique",
    label_fr: "Panneau rayonnant électrique",
    synonyms: ["panneau rayonnant", "PR élec"],
    ademe_code: "Panneau rayonnant électrique",
    rendement_emission: 0.95,
    typical_lifespan_years: 20,
  },
  {
    code: "plancher_chauffant_electrique",
    label_fr: "Plancher chauffant électrique",
    synonyms: ["PCE", "plancher rayonnant élec"],
    ademe_code: "Plancher chauffant électrique",
    rendement_emission: 1.0,
    typical_lifespan_years: 30,
  },
  {
    code: "plafond_rayonnant_electrique",
    label_fr: "Plafond rayonnant électrique",
    synonyms: ["plafond rayonnant élec"],
    ademe_code: "Plafond rayonnant électrique",
    rendement_emission: 1.0,
    typical_lifespan_years: 30,
  },
  {
    code: "air_souffle_gainable",
    label_fr: "Air soufflé / gainable",
    synonyms: ["gainable", "air pulsé", "soufflage chauffage"],
    ademe_code: "Air soufflé (gainable)",
    rendement_emission: 0.92,
    typical_lifespan_years: 20,
  },
  {
    code: "poele_insert",
    label_fr: "Poêle / insert (émission directe)",
    synonyms: ["poêle bois", "insert", "poêle granulés"],
    ademe_code: "Poêle ou insert",
    rendement_emission: 0.95,
    typical_lifespan_years: 25,
  },
  {
    code: "soufflant_electrique",
    label_fr: "Soufflant électrique",
    synonyms: ["soufflant", "ventilo électrique"],
    ademe_code: "Soufflant électrique",
    rendement_emission: 0.95,
    typical_lifespan_years: 15,
  },
] as const;

export type ChauffageEmetteurCode = typeof CHAUFFAGE_EMETTEUR_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 2.3  CHAUFFAGE_REGULATION_TYPES — Régulation chauffage
// ----------------------------------------------------------------------------
// Source : 08d_seer.md → table Rreg (rendement régulation)
// ----------------------------------------------------------------------------

export const CHAUFFAGE_REGULATION_TYPES = [
  {
    code: "pas_de_regulation",
    label_fr: "Pas de régulation",
    synonyms: ["aucune régulation", "sans thermostat", "marche permanente"],
    ademe_code: "Aucune régulation",
    rendement_regulation: 0.88,
  },
  {
    code: "thermostat_ambiance_central",
    label_fr: "Thermostat d'ambiance central (TOR)",
    synonyms: ["thermostat", "thermostat unique", "TOR central", "thermostat tout-ou-rien"],
    ademe_code: "Thermostat d'ambiance (TOR)",
    rendement_regulation: 0.92,
  },
  {
    code: "thermostat_programmable_horloge",
    label_fr: "Thermostat programmable + horloge",
    synonyms: ["thermostat programmable", "thermostat horaire", "TOR + horloge"],
    ademe_code: "TOR + horloge / programmation",
    rendement_regulation: 0.94,
  },
  {
    code: "robinets_thermostatiques",
    label_fr: "Robinets thermostatiques (RTH)",
    synonyms: ["RTH", "robinet thermostatique", "vanne thermostatique"],
    ademe_code: "Robinets thermostatiques",
    rendement_regulation: 0.97,
  },
  {
    code: "rth_avec_optimisation",
    label_fr: "RTH + régulation optimisée (sonde extérieure)",
    synonyms: ["RTH + sonde ext", "RTH + loi d'eau", "régulation optimisée"],
    ademe_code: "RTH + régulation optimisée",
    rendement_regulation: 0.99,
  },
  {
    code: "regulation_par_zone",
    label_fr: "Régulation par zone (2-3 zones)",
    synonyms: ["régulation zonale", "thermostat par zone", "multi-zones"],
    ademe_code: "Régulation par zone",
    rendement_regulation: 0.95,
  },
  {
    code: "regulation_piece_par_piece_classe_a_b",
    label_fr: "Régulation pièce par pièce classe A/B (connecté)",
    synonyms: ["régulation pièce par pièce", "thermostat connecté", "tête connectée", "classe A B"],
    ademe_code: "Régulation pièce par pièce (Classe A/B)",
    rendement_regulation: 1.00,
  },
  {
    code: "sonde_exterieure_seule",
    label_fr: "Sonde extérieure (loi d'eau seule)",
    synonyms: ["loi d'eau", "sonde extérieure", "régulation climatique"],
    ademe_code: "Sonde extérieure",
    rendement_regulation: 0.94,
  },
  {
    code: "gtb_gtc_immeuble",
    label_fr: "GTB/GTC (gestion technique du bâtiment)",
    synonyms: ["GTB", "GTC", "supervision", "régulation centralisée immeuble"],
    ademe_code: "GTB / GTC",
    rendement_regulation: 0.97,
    individuel_ou_collectif: "collectif",
  },
] as const;

export type ChauffageRegulationCode = typeof CHAUFFAGE_REGULATION_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 2.4  ECS_GENERATEUR_TYPES — Production d'eau chaude sanitaire
// ----------------------------------------------------------------------------
// Source : 17b_dpe_tables_systemes.md, dpe_guide_equipements-techniques.md
// + XML DPE → enum_type_generateur_ecs_id (string)
// ----------------------------------------------------------------------------

export const ECS_GENERATEUR_TYPES = [
  {
    code: "cumulus_electrique_classique",
    label_fr: "Cumulus électrique (chauffe-eau électrique à accumulation)",
    synonyms: ["cumulus", "ballon élec", "CEE", "chauffe-eau électrique"],
    ademe_code: "Chauffe-eau électrique à accumulation",
    rendement_generation: 1.0, // Effet Joule
    volume_typique_litres: 200,
    typical_lifespan_years: 12,
    individuel_ou_collectif: "individuel",
    common_pathologies: ["entartrage_resistance", "corrosion_cuve"],
  },
  {
    code: "cumulus_electrique_ace_acl",
    label_fr: "Cumulus électrique avec résistance stéatite (ACI)",
    synonyms: ["ACI", "stéatite", "cumulus stéatite", "anode active"],
    ademe_code: "Chauffe-eau électrique avec ACI",
    rendement_generation: 1.0,
    volume_typique_litres: 200,
    typical_lifespan_years: 15,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "ballon_thermodynamique_cet",
    label_fr: "Chauffe-eau thermodynamique (CET, ballon TD)",
    synonyms: ["CET", "ballon thermodynamique", "ballon TD", "chauffe-eau TD"],
    ademe_code: "Chauffe-eau thermodynamique",
    cop_typique: 2.5,
    volume_typique_litres: 200,
    typical_lifespan_years: 17,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "chauffe_eau_gaz_instantane",
    label_fr: "Chauffe-eau gaz instantané (chauffe-bain)",
    synonyms: ["chauffe-bain", "chauffe-eau gaz instantané", "CEG"],
    ademe_code: "Chauffe-eau gaz instantané",
    rendement_generation: 0.85,
    typical_lifespan_years: 15,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "chauffe_eau_gaz_accumulation",
    label_fr: "Chauffe-eau gaz à accumulation",
    synonyms: ["ballon gaz", "chauffe-eau gaz ballon", "accumulateur gaz"],
    ademe_code: "Chauffe-eau gaz à accumulation",
    rendement_generation: 0.78,
    volume_typique_litres: 150,
    typical_lifespan_years: 15,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "ecs_par_chaudiere_couplee",
    label_fr: "ECS par chaudière (couplée chauffage)",
    synonyms: ["ECS chaudière", "ballon couplé chaudière", "chaudière mixte", "chaudière + ballon"],
    ademe_code: "ECS par générateur de chauffage (couplée)",
    rendement_generation: 0.85, // Hérite de la chaudière
    volume_typique_litres: 100,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "ecs_solaire_individuelle_cesi",
    label_fr: "Chauffe-eau solaire individuel (CESI)",
    synonyms: ["CESI", "ECS solaire", "chauffe-eau solaire", "solaire thermique ECS"],
    ademe_code: "Chauffe-eau solaire individuel (CESI)",
    couverture_solaire_typique: 0.60,
    volume_typique_litres: 300,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "individuel",
  },
  {
    code: "ecs_solaire_collective_cesc",
    label_fr: "Chauffe-eau solaire collectif (CESC)",
    synonyms: ["CESC", "ECS solaire collective", "solaire thermique copropriété"],
    ademe_code: "Chauffe-eau solaire collectif (CESC)",
    couverture_solaire_typique: 0.50,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "ecs_pac_dediee",
    label_fr: "PAC dédiée ECS",
    synonyms: ["PAC ECS", "pompe à chaleur ECS"],
    ademe_code: "PAC dédiée ECS",
    cop_typique: 3.0,
    volume_typique_litres: 300,
    typical_lifespan_years: 17,
    individuel_ou_collectif: "les_deux",
  },
  {
    code: "ecs_reseau_chaleur",
    label_fr: "ECS par réseau de chaleur urbain",
    synonyms: ["ECS RCU", "ECS chauffage urbain"],
    ademe_code: "ECS par réseau de chaleur",
    rendement_generation: 0.90,
    typical_lifespan_years: 40,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "ecs_inconnu_forfait",
    label_fr: "Générateur ECS inconnu (forfait)",
    synonyms: ["ECS inconnu", "non identifiable"],
    ademe_code: "Inconnu — forfait selon énergie",
    calcule_par_3cl: true,
  },
] as const;

export type EcsGenerateurCode = typeof ECS_GENERATEUR_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 2.5  VENTILATION_TYPES_3CL — Ventilation côté DPE 3CL
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_type_ventilation_id +
// table tv('debits_ventilation', {type_ventilation}).
//
// COHÉRENCE VTU : Ces codes 3CL sont volontairement réduits à ce que le
// moteur 3CL distingue. Pour une nomenclature plus fine (technologie, marque,
// pose), voir VENTILATION_TYPES dans pppt_systemes.ts (cross-référencé via
// le champ `pppt_ref` ci-dessous).
// ----------------------------------------------------------------------------

export const VENTILATION_TYPES_3CL = [
  {
    code: "ventilation_naturelle_par_ouvrants",
    label_fr: "Ventilation par ouverture des fenêtres (sans système)",
    synonyms: ["ouverture fenêtres", "aération manuelle", "sans VMC", "ouvrants"],
    ademe_code: "Ventilation par ouverture des fenêtres",
    pppt_ref: "ventilation_naturelle_ouvrants",
  },
  {
    code: "ventilation_naturelle_par_conduits",
    label_fr: "Ventilation naturelle par conduits (haut/bas)",
    synonyms: ["VN", "ventilation naturelle conduits", "tirage thermique", "conduits Shunt"],
    ademe_code: "Ventilation naturelle par conduits",
    pppt_ref: "ventilation_naturelle_conduits",
  },
  {
    code: "vmc_simple_flux_autoreglable",
    label_fr: "VMC simple flux autoréglable",
    synonyms: ["VMC SF auto", "VMC autoréglable", "VMC simple flux standard"],
    ademe_code: "VMC simple flux autoréglable",
    pppt_ref: "vmc_simple_flux_autoreglable",
    typical_lifespan_years: 20,
  },
  {
    code: "vmc_simple_flux_hygro_a",
    label_fr: "VMC simple flux hygroréglable type A",
    synonyms: ["VMC SF hygro A", "VMC hygro A", "hygroréglable bouches uniquement"],
    ademe_code: "VMC simple flux hygroréglable A",
    pppt_ref: "vmc_simple_flux_hygro_a",
    typical_lifespan_years: 20,
  },
  {
    code: "vmc_simple_flux_hygro_b",
    label_fr: "VMC simple flux hygroréglable type B",
    synonyms: ["VMC SF hygro B", "VMC hygro B", "hygroréglable entrées + bouches"],
    ademe_code: "VMC simple flux hygroréglable B",
    pppt_ref: "vmc_simple_flux_hygro_b",
    typical_lifespan_years: 20,
  },
  {
    code: "vmc_double_flux_sans_echangeur",
    label_fr: "VMC double flux sans échangeur",
    synonyms: ["VMC DF sans échangeur"],
    ademe_code: "VMC double flux sans échangeur",
    pppt_ref: "vmc_double_flux",
    typical_lifespan_years: 20,
  },
  {
    code: "vmc_double_flux_avec_echangeur",
    label_fr: "VMC double flux avec échangeur (récupération chaleur)",
    synonyms: ["VMC DF", "double flux thermodynamique", "VMC DF échangeur", "DF récupération"],
    ademe_code: "VMC double flux avec échangeur",
    pppt_ref: "vmc_double_flux",
    rendement_echangeur_typique: 0.80,
    typical_lifespan_years: 20,
  },
  {
    code: "vmc_gaz",
    label_fr: "VMC gaz (chaudière VMC)",
    synonyms: ["VMC gaz", "chaudière VMC", "VMC raccordée chaudière"],
    ademe_code: "VMC gaz",
    pppt_ref: "vmc_simple_flux_autoreglable",
    typical_lifespan_years: 20,
  },
  {
    code: "vmi_insufflation",
    label_fr: "VMI (Ventilation Mécanique par Insufflation)",
    synonyms: ["VMI", "ventilation par insufflation", "VPI"],
    ademe_code: "Ventilation mécanique par insufflation",
    pppt_ref: "vmi_insufflation",
    typical_lifespan_years: 15,
  },
  {
    code: "vmc_hybride_hygroreglable",
    label_fr: "VMC hybride hygroréglable",
    synonyms: ["VMC hybride", "ventilation hybride hygro"],
    ademe_code: "Ventilation hybride hygroréglable",
    pppt_ref: "vmc_simple_flux_hygro_b",
    typical_lifespan_years: 20,
  },
  {
    code: "ventilation_inconnue_forfait",
    label_fr: "Ventilation inconnue (forfait)",
    synonyms: ["ventilation inconnue", "non identifiable"],
    ademe_code: "Inconnu — forfait selon période",
    pppt_ref: "ventilation_inconnue",
    calcule_par_3cl: true,
  },
] as const;

export type VentilationCode3CL = typeof VENTILATION_TYPES_3CL[number]["code"];

// ----------------------------------------------------------------------------
// 2.6  CLIMATISATION_TYPES — Climatisation
// ----------------------------------------------------------------------------
// Source : 17b_dpe_tables_systemes.md, dpe_guide_equipements-techniques.md
// 3CL ne prend en compte que les équipements FIXES (mobiles ignorés).
// ----------------------------------------------------------------------------

export const CLIMATISATION_TYPES = [
  {
    code: "climatisation_absente",
    label_fr: "Pas de climatisation",
    synonyms: ["sans clim", "pas de climatisation", "aucune"],
    ademe_code: "Aucune climatisation",
  },
  {
    code: "split_inverter_mono",
    label_fr: "Split inverter mono-split",
    synonyms: ["mono-split", "split inverter", "clim split"],
    ademe_code: "Split inverter (mono)",
    seer_typique: 5.5,
    typical_lifespan_years: 15,
  },
  {
    code: "multi_split_inverter",
    label_fr: "Multi-split inverter",
    synonyms: ["multi-split", "clim multi", "split multi-zones"],
    ademe_code: "Multi-split inverter",
    seer_typique: 5.0,
    typical_lifespan_years: 15,
  },
  {
    code: "climatisation_centrale_drv_vrv",
    label_fr: "Climatisation centrale DRV/VRV",
    synonyms: ["DRV", "VRV", "DRF", "clim centrale", "groupe centralisé"],
    ademe_code: "Climatisation centrale DRV/VRV",
    seer_typique: 4.5,
    typical_lifespan_years: 20,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "climatisation_centrale_eau_glacee",
    label_fr: "Climatisation centrale à eau glacée (chiller)",
    synonyms: ["chiller", "groupe eau glacée", "GEG", "clim eau glacée"],
    ademe_code: "Climatisation centrale eau glacée",
    seer_typique: 4.0,
    typical_lifespan_years: 25,
    individuel_ou_collectif: "collectif",
  },
  {
    code: "pac_air_air_reversible_chauffage",
    label_fr: "PAC air/air réversible (mode froid utilisé)",
    synonyms: ["PAC réversible", "split réversible utilisé en froid"],
    ademe_code: "PAC air/air en mode froid",
    seer_typique: 5.0,
    typical_lifespan_years: 15,
  },
  {
    code: "ventilo_convecteur_eau_glacee",
    label_fr: "Ventilo-convecteur sur eau glacée",
    synonyms: ["VC eau glacée", "fan-coil froid"],
    ademe_code: "Ventilo-convecteur sur eau glacée",
    typical_lifespan_years: 20,
  },
] as const;

export type ClimatisationCode = typeof CLIMATISATION_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 2.7  ENERGIES_VECTEURS — Vecteurs énergétiques
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md (Cep, GES par usage) +
// 04a_dpe_etiquettes_methode_3cl.md + arrêté 13/08/2025 (Ep_élec 1,9)
//
// CRITIQUE Ep ÉLECTRICITÉ :
//   - DPE existant émis ≥ 01/01/2026 : Ep = 1,9 (arrêté du 13/08/2025)
//   - DPE existant émis avant 01/01/2026 : Ep = 2,3 (RT/RE2020 hist.)
//   - RE2020 neuf : maintien à 2,3
//
// Les facteurs GES électricité varient PAR USAGE (chauffage / ECS /
// refroidissement / éclairage / auxiliaires) → champ ges_par_usage.
// ----------------------------------------------------------------------------

export const ENERGIES_VECTEURS = [
  {
    code: "electricite",
    label_fr: "Électricité",
    synonyms: ["élec", "EDF", "kWh élec", "courant"],
    ademe_code: "Électricité",
    cep_facteur: 1.9, // Depuis 01/01/2026 (arrêté 13/08/2025)
    cep_facteur_dpe_avant_2026: 2.3,
    cep_facteur_re2020_neuf: 2.3,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.079,
      ecs: 0.065,
      refroidissement: 0.064,
      eclairage: 0.064,
      auxiliaires: 0.064,
    },
  },
  {
    code: "gaz_naturel",
    label_fr: "Gaz naturel",
    synonyms: ["gaz", "gaz de ville", "GN", "gaz naturel"],
    ademe_code: "Gaz naturel",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.227,
      ecs: 0.227,
      refroidissement: 0.227,
      eclairage: 0.227,
      auxiliaires: 0.227,
    },
  },
  {
    code: "gpl_propane_butane",
    label_fr: "GPL (propane / butane)",
    synonyms: ["GPL", "propane", "butane", "citerne propane"],
    ademe_code: "GPL (propane/butane)",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.272,
      ecs: 0.272,
    },
  },
  {
    code: "fioul_domestique",
    label_fr: "Fioul domestique",
    synonyms: ["fioul", "fuel", "FOD", "mazout"],
    ademe_code: "Fioul domestique",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.324,
      ecs: 0.324,
    },
  },
  {
    code: "bois_buches",
    label_fr: "Bois bûches",
    synonyms: ["bois", "bûches", "bois bûches"],
    ademe_code: "Bois — bûches",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.030,
      ecs: 0.030,
    },
  },
  {
    code: "bois_granules_pellets",
    label_fr: "Bois — granulés (pellets)",
    synonyms: ["pellets", "granulés", "bois granulés"],
    ademe_code: "Bois — granulés",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.030,
      ecs: 0.030,
    },
  },
  {
    code: "bois_plaquettes",
    label_fr: "Bois — plaquettes forestières",
    synonyms: ["plaquettes", "bois déchiqueté", "MAP plaquettes"],
    ademe_code: "Bois — plaquettes",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.030,
      ecs: 0.030,
    },
  },
  {
    code: "reseau_chaleur",
    label_fr: "Réseau de chaleur (RCU)",
    synonyms: ["RCU", "chauffage urbain", "réseau chaleur"],
    ademe_code: "Réseau de chaleur",
    cep_facteur: 1.0, // Variable selon mix du réseau — valeur à saisir
    // TODO Omar à valider — facteur GES variable selon contenu CO2 du réseau
    // (déclaration annuelle gestionnaire — ex: CPCU Paris ~0,12 kgCO2/kWh)
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.116, // Valeur indicative moyenne France 2024
      ecs: 0.116,
    },
    note: "Facteur GES variable — utiliser la valeur déclarée par le gestionnaire du réseau",
  },
  {
    code: "reseau_froid",
    label_fr: "Réseau de froid",
    synonyms: ["RFU", "réseau froid"],
    ademe_code: "Réseau de froid",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      refroidissement: 0.116, // Indicatif
    },
    note: "Facteur GES variable — utiliser la valeur déclarée par le gestionnaire du réseau",
  },
  {
    code: "solaire_thermique",
    label_fr: "Solaire thermique",
    synonyms: ["solaire", "ST", "capteurs solaires thermiques"],
    ademe_code: "Solaire thermique",
    cep_facteur: 0.0, // Énergie gratuite et renouvelable
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.0,
      ecs: 0.0,
    },
  },
  {
    code: "charbon",
    label_fr: "Charbon",
    synonyms: ["charbon", "coke"],
    ademe_code: "Charbon",
    cep_facteur: 1.0,
    ges_par_usage_kgco2_kwh: {
      chauffage: 0.384,
    },
  },
] as const;

export type EnergieVecteurCode = typeof ENERGIES_VECTEURS[number]["code"];

// ----------------------------------------------------------------------------
// 2.8  PRODUCTION_LOCALE_TYPES — Production locale d'énergie
// ----------------------------------------------------------------------------
// Source : 06b_3cl_consommations_enr_pv.md, dpe_guide_equipements-techniques.md
// Le moteur 3CL ne prend en compte officiellement que PV + solaire thermique.
// Les autres ENR sont listés pour cohérence VTU mais flagués calcule_par_3cl: false.
// ----------------------------------------------------------------------------

export const PRODUCTION_LOCALE_TYPES = [
  {
    code: "panneaux_photovoltaiques",
    label_fr: "Panneaux photovoltaïques (PV)",
    synonyms: ["PV", "panneaux solaires", "photovoltaïque", "solaire électrique"],
    ademe_code: "Panneaux photovoltaïques",
    typical_lifespan_years: 25,
    calcule_par_3cl: true,
    note: "Production déduite de la conso 5 usages (autoconsommation conventionnelle)",
  },
  {
    code: "solaire_thermique_cesi",
    label_fr: "Solaire thermique CESI (ECS)",
    synonyms: ["CESI", "solaire ECS", "capteurs solaires ECS"],
    ademe_code: "Chauffe-eau solaire individuel",
    typical_lifespan_years: 25,
    calcule_par_3cl: true,
  },
  {
    code: "solaire_thermique_ssc",
    label_fr: "Système solaire combiné (SSC) — chauffage + ECS",
    synonyms: ["SSC", "solaire combiné", "PSD"],
    ademe_code: "Système solaire combiné",
    typical_lifespan_years: 25,
    calcule_par_3cl: true,
  },
  {
    code: "panneaux_hybrides_pvt",
    label_fr: "Panneaux hybrides PV/T (photovoltaïque + thermique)",
    synonyms: ["PV-T", "hybrides", "DualSun"],
    ademe_code: "Capteurs solaires hybrides PV/T",
    typical_lifespan_years: 25,
    calcule_par_3cl: true,
  },
  {
    code: "micro_cogeneration",
    label_fr: "Micro-cogénération",
    synonyms: ["micro-cogé", "micro-CHP", "cogé domestique"],
    ademe_code: "Micro-cogénération",
    typical_lifespan_years: 20,
    calcule_par_3cl: true,
  },
  {
    code: "micro_eolienne",
    label_fr: "Micro-éolienne",
    synonyms: ["éolienne", "petit éolien", "éolienne domestique"],
    ademe_code: "Micro-éolien (hors moteur 3CL)",
    typical_lifespan_years: 20,
    calcule_par_3cl: false, // Non géré par le moteur 3CL standard
  },
  {
    code: "production_locale_inconnue",
    label_fr: "Production locale inconnue / autre",
    synonyms: ["autre ENR", "production locale non précisée"],
    ademe_code: "Autre / inconnue",
    calcule_par_3cl: false,
  },
] as const;

export type ProductionLocaleCode = typeof PRODUCTION_LOCALE_TYPES[number]["code"];

// ============================================================================
// 3. INERTIE & ÉTANCHÉITÉ
// ============================================================================

// ----------------------------------------------------------------------------
// 3.1  INERTIE_THERMIQUE_TYPES — Classes d'inertie thermique
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_classe_inertie_id (string, 0-3)
// 3CL 2021 utilise 4 classes (pas 5 — la classe "très légère" n'existe pas).
// L'inertie pondère le calcul du confort d'été et du facteur d'utilisation
// des apports gratuits.
// ----------------------------------------------------------------------------

export const INERTIE_THERMIQUE_TYPES = [
  {
    code: "inertie_legere",
    label_fr: "Inertie légère",
    synonyms: ["légère", "inertie faible", "ossature bois sans dalle"],
    ademe_id: "0",
    ademe_code: "Inertie légère",
    cin_wh_k_m2: 110000,
    facteur_utilisation_chauffage_exposant: 2.5,
  },
  {
    code: "inertie_moyenne",
    label_fr: "Inertie moyenne",
    synonyms: ["moyenne", "inertie standard"],
    ademe_id: "1",
    ademe_code: "Inertie moyenne",
    cin_wh_k_m2: 165000,
    facteur_utilisation_chauffage_exposant: 2.9,
  },
  {
    code: "inertie_lourde",
    label_fr: "Inertie lourde",
    synonyms: ["lourde", "béton apparent", "dalle béton non isolée"],
    ademe_id: "2",
    ademe_code: "Inertie lourde",
    cin_wh_k_m2: 260000,
    facteur_utilisation_chauffage_exposant: 3.6,
  },
  {
    code: "inertie_tres_lourde",
    label_fr: "Inertie très lourde",
    synonyms: ["très lourde", "pierre massive", "bâtiment ancien massif"],
    ademe_id: "3",
    ademe_code: "Inertie très lourde",
    cin_wh_k_m2: 260000,
    facteur_utilisation_chauffage_exposant: 3.6,
  },
] as const;

export type InertieThermiqueCode = typeof INERTIE_THERMIQUE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 3.2  PERMEABILITE_AIR_TYPES — Catégories de perméabilité à l'air
// ----------------------------------------------------------------------------
// Source : 06b_3cl_sorties_tables_lookup.md → table tv('q4pa_conv', ...)
// La table 3CL fonctionne par croisement {période × méthode × isolation × joints}.
// Les Q4Pa-surf indiqués ci-dessous sont des valeurs synthétiques de référence
// pour orienter la saisie — les valeurs précises proviennent de tv.js.
// ----------------------------------------------------------------------------

export const PERMEABILITE_AIR_TYPES = [
  {
    code: "tres_etanche_re2020",
    label_fr: "Très étanche (RE2020 / passivhaus, mesure test)",
    synonyms: ["RE2020", "passivhaus", "test étanchéité OK", "Q4 < 0.6"],
    ademe_code: "Mesure d'étanchéité < 0,6 m³/h/m²",
    q4pa_surf_m3_h_m2: 0.4,
  },
  {
    code: "etanche_rt2012",
    label_fr: "Étanche RT2012 (mesure test)",
    synonyms: ["RT2012", "BBC", "Q4 < 1.0"],
    ademe_code: "Mesure RT2012 (≤ 0,6 maison / ≤ 1,0 collectif)",
    q4pa_surf_m3_h_m2: 0.6,
  },
  {
    code: "moyen_rt2005_2012",
    label_fr: "Étanchéité moyenne (RT2005-2012, sans test)",
    synonyms: ["RT2005", "construction 2006-2012", "moyen"],
    ademe_code: "Construction RT2005/2012 sans mesure",
    q4pa_surf_m3_h_m2: 1.2,
  },
  {
    code: "faible_avant_rt2005",
    label_fr: "Étanchéité faible (avant RT2005)",
    synonyms: ["avant 2005", "RT2000", "faible"],
    ademe_code: "Construction antérieure à RT2005",
    q4pa_surf_m3_h_m2: 1.7,
  },
  {
    code: "tres_faible_avant_1975",
    label_fr: "Étanchéité très faible (avant 1975)",
    synonyms: ["bâtiment ancien", "avant RT1974", "très faible", "joints absents"],
    ademe_code: "Bâtiment antérieur à 1975 (sans réfection joints)",
    q4pa_surf_m3_h_m2: 2.5,
  },
  {
    code: "mesure_test_in_situ",
    label_fr: "Mesure d'étanchéité réalisée in situ (test infiltrométrie)",
    synonyms: ["test", "infiltrométrie", "blower door", "porte soufflante"],
    ademe_code: "Mesure d'étanchéité in situ",
    note: "Saisir la valeur Q4Pa-surf mesurée",
  },
  {
    code: "permeabilite_inconnue_forfait",
    label_fr: "Perméabilité inconnue (forfait selon période)",
    synonyms: ["inconnue", "forfait période"],
    ademe_code: "Inconnu — forfait selon période + isolation + joints",
    calcule_par_3cl: true,
  },
] as const;

export type PermeabiliteAirCode = typeof PERMEABILITE_AIR_TYPES[number]["code"];

// ============================================================================
// 4. CLASSES & ÉTIQUETTES
// ============================================================================

// ----------------------------------------------------------------------------
// 4.1  ETIQUETTE_DPE_ENERGIE — Classes énergie A à G
// ----------------------------------------------------------------------------
// Source : 17c_dpe_tables_resultats.md, 04a_dpe_etiquettes_methode_3cl.md
// Arrêté du 31/03/2021 modifié — double seuil Cep + EGES
//
// RÈGLE FONDAMENTALE : Classe finale = MAX(classe_énergie, classe_GES)
// Un logement peu énergivore mais émetteur sera classé sur l'EGES.
//
// Modulation zones montagne (H1b/H1c/H2d > 800 m) → champ seuil_cep_montagne
// ----------------------------------------------------------------------------

export const ETIQUETTE_DPE_ENERGIE = [
  {
    code: "classe_a",
    label_fr: "Classe A",
    synonyms: ["A", "très performant"],
    ademe_code: "A",
    seuil_cep_max_kwhep_m2_an: 70,
    seuil_eges_max_kgco2_m2_an: 6,
    regle: "Cep < 70 ET EGES < 6",
  },
  {
    code: "classe_b",
    label_fr: "Classe B",
    synonyms: ["B", "performant"],
    ademe_code: "B",
    seuil_cep_max_kwhep_m2_an: 110,
    seuil_eges_max_kgco2_m2_an: 11,
    regle: "(70 ≤ Cep < 110 ET EGES < 11) OU (6 ≤ EGES < 11 ET Cep < 110)",
  },
  {
    code: "classe_c",
    label_fr: "Classe C",
    synonyms: ["C", "assez performant"],
    ademe_code: "C",
    seuil_cep_max_kwhep_m2_an: 180,
    seuil_eges_max_kgco2_m2_an: 30,
    regle: "(110 ≤ Cep < 180 ET EGES < 30) OU (11 ≤ EGES < 30 ET Cep < 180)",
  },
  {
    code: "classe_d",
    label_fr: "Classe D",
    synonyms: ["D", "moyen"],
    ademe_code: "D",
    seuil_cep_max_kwhep_m2_an: 250,
    seuil_eges_max_kgco2_m2_an: 50,
    regle: "(180 ≤ Cep < 250 ET EGES < 50) OU (30 ≤ EGES < 50 ET Cep < 250)",
  },
  {
    code: "classe_e",
    label_fr: "Classe E",
    synonyms: ["E", "peu performant"],
    ademe_code: "E",
    seuil_cep_max_kwhep_m2_an: 330,
    seuil_eges_max_kgco2_m2_an: 70,
    seuil_cep_montagne_max: 390,
    seuil_eges_montagne_max: 80,
    regle: "(250 ≤ Cep < 330 ET EGES < 70) OU (50 ≤ EGES < 70 ET Cep < 330)",
  },
  {
    code: "classe_f",
    label_fr: "Classe F (passoire thermique)",
    synonyms: ["F", "passoire", "passoire thermique"],
    ademe_code: "F",
    seuil_cep_max_kwhep_m2_an: 420,
    seuil_eges_max_kgco2_m2_an: 100,
    seuil_cep_montagne_max: 500,
    seuil_eges_montagne_max: 110,
    regle: "(330 ≤ Cep < 420 ET EGES < 100) OU (70 ≤ EGES < 100 ET Cep < 420)",
    passoire_thermique: true,
  },
  {
    code: "classe_g",
    label_fr: "Classe G (passoire thermique)",
    synonyms: ["G", "passoire", "passoire thermique extrême"],
    ademe_code: "G",
    seuil_cep_min_kwhep_m2_an: 420,
    seuil_eges_min_kgco2_m2_an: 100,
    regle: "Cep ≥ 420 OU EGES ≥ 100",
    passoire_thermique: true,
    interdiction_location_metropole: "01/01/2025 (logements > 450 kWh/m²/an EF) puis 01/01/2028 toutes G",
  },
] as const;

export type EtiquetteDpeEnergieCode = typeof ETIQUETTE_DPE_ENERGIE[number]["code"];

// ----------------------------------------------------------------------------
// 4.2  ETIQUETTE_DPE_GES — Étiquette carbone (climat) seule
// ----------------------------------------------------------------------------
// Source : 17c_dpe_tables_resultats.md (seuils EGES seul)
// ----------------------------------------------------------------------------

export const ETIQUETTE_DPE_GES = [
  {
    code: "ges_a",
    label_fr: "GES A",
    synonyms: ["A climat", "très peu émetteur"],
    ademe_code: "A",
    seuil_eges_max_kgco2_m2_an: 6,
  },
  {
    code: "ges_b",
    label_fr: "GES B",
    synonyms: ["B climat"],
    ademe_code: "B",
    seuil_eges_max_kgco2_m2_an: 11,
  },
  {
    code: "ges_c",
    label_fr: "GES C",
    synonyms: ["C climat"],
    ademe_code: "C",
    seuil_eges_max_kgco2_m2_an: 30,
  },
  {
    code: "ges_d",
    label_fr: "GES D",
    synonyms: ["D climat"],
    ademe_code: "D",
    seuil_eges_max_kgco2_m2_an: 50,
  },
  {
    code: "ges_e",
    label_fr: "GES E",
    synonyms: ["E climat"],
    ademe_code: "E",
    seuil_eges_max_kgco2_m2_an: 70,
    seuil_eges_montagne_max: 80,
  },
  {
    code: "ges_f",
    label_fr: "GES F",
    synonyms: ["F climat"],
    ademe_code: "F",
    seuil_eges_max_kgco2_m2_an: 100,
    seuil_eges_montagne_max: 110,
  },
  {
    code: "ges_g",
    label_fr: "GES G",
    synonyms: ["G climat", "très émetteur"],
    ademe_code: "G",
    seuil_eges_min_kgco2_m2_an: 100,
  },
] as const;

export type EtiquetteDpeGesCode = typeof ETIQUETTE_DPE_GES[number]["code"];

// ----------------------------------------------------------------------------
// 4.3  ZONE_CLIMATIQUE_FR — Zones climatiques France métropolitaine
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_zone_climatique_id (string 1-8)
// + 06a_dpewin_donnees_admin_techniques.md (table département → zone)
//
// CRITIQUE : enum_zone_climatique_id est un STRING dans tv.js et XML DPE
// (et non un number — un lookup avec un entier échoue silencieusement).
// ----------------------------------------------------------------------------

export const ZONE_CLIMATIQUE_FR = [
  {
    code: "h1a",
    label_fr: "Zone H1a — Continental nord (Île-de-France, Nord)",
    synonyms: ["H1a", "zone froide nord", "Paris", "Lille"],
    ademe_id: "1",
    ademe_code: "H1a",
    departements_principaux: ["02", "08", "59", "60", "62", "75", "77", "78", "80", "91", "92", "93", "94", "95"],
    villes_representatives: ["Paris", "Lille", "Amiens", "Versailles"],
    climat: "Continental nord (hiver rigoureux)",
  },
  {
    code: "h1b",
    label_fr: "Zone H1b — Continental est (Alsace, Lorraine, Bourgogne)",
    synonyms: ["H1b", "zone froide est", "Strasbourg", "Nancy"],
    ademe_id: "2",
    ademe_code: "H1b",
    departements_principaux: ["10", "21", "25", "39", "45", "51", "52", "54", "55", "57", "58", "67", "68", "70", "71", "88", "89", "90"],
    villes_representatives: ["Strasbourg", "Metz", "Nancy", "Dijon (limite)"],
    climat: "Continental est (hiver très rigoureux)",
    modulation_seuil_montagne_au_dessus_800m: true,
  },
  {
    code: "h1c",
    label_fr: "Zone H1c — Montagne (Rhône-Alpes, Auvergne)",
    synonyms: ["H1c", "zone montagne", "Auvergne", "Rhône-Alpes hauteur"],
    ademe_id: "3",
    ademe_code: "H1c",
    departements_principaux: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
    villes_representatives: ["Grenoble", "Clermont-Ferrand", "Lyon (limite)", "Annecy"],
    climat: "Montagnard (hiver très rigoureux)",
    modulation_seuil_montagne_au_dessus_800m: true,
  },
  {
    code: "h2a",
    label_fr: "Zone H2a — Océanique nord (Bretagne, Normandie)",
    synonyms: ["H2a", "zone océanique nord", "Bretagne", "Normandie"],
    ademe_id: "4",
    ademe_code: "H2a",
    departements_principaux: ["14", "22", "27", "28", "29", "35", "44", "49", "50", "53", "56", "61", "72", "76", "85"],
    villes_representatives: ["Rennes", "Nantes", "Caen", "Rouen"],
    climat: "Océanique tempéré nord",
  },
  {
    code: "h2b",
    label_fr: "Zone H2b — Océanique centre (Pays de Loire, Centre)",
    synonyms: ["H2b", "zone océanique centre", "Centre-Val de Loire"],
    ademe_id: "5",
    ademe_code: "H2b",
    departements_principaux: ["16", "17", "19", "23", "24", "36", "37", "41", "46", "79", "86", "87"],
    villes_representatives: ["Tours", "Poitiers", "Limoges", "Angoulême"],
    climat: "Océanique tempéré centre",
  },
  {
    code: "h2c",
    label_fr: "Zone H2c — Océanique sud / Aquitaine (Sud-Ouest)",
    synonyms: ["H2c", "zone océanique sud", "Aquitaine", "Sud-Ouest"],
    ademe_id: "6",
    ademe_code: "H2c",
    departements_principaux: ["09", "12", "31", "32", "33", "40", "47", "64", "65", "81", "82"],
    villes_representatives: ["Bordeaux", "Toulouse", "Pau", "Bayonne"],
    climat: "Océanique tempéré sud",
  },
  {
    code: "h2d",
    label_fr: "Zone H2d — Méditerranéen intérieur / Montagne sud + Corse",
    synonyms: ["H2d", "Languedoc intérieur", "Corse"],
    ademe_id: "7",
    ademe_code: "H2d",
    departements_principaux: ["04", "05", "2A", "2B", "48"],
    villes_representatives: ["Gap", "Briançon", "Corte", "Mende"],
    climat: "Méditerranéen intérieur / montagne sud",
    modulation_seuil_montagne_au_dessus_800m: true,
  },
  {
    code: "h3",
    label_fr: "Zone H3 — Méditerranéen littoral (PACA, Languedoc-Roussillon)",
    synonyms: ["H3", "Méditerranée", "PACA", "Côte d'Azur", "Languedoc"],
    ademe_id: "8",
    ademe_code: "H3",
    departements_principaux: ["06", "11", "13", "30", "34", "66", "83", "84"],
    villes_representatives: ["Marseille", "Nice", "Montpellier", "Perpignan"],
    climat: "Méditerranéen littoral (hiver doux, été chaud)",
  },
] as const;

export type ZoneClimatiqueFrCode = typeof ZONE_CLIMATIQUE_FR[number]["code"];

// ----------------------------------------------------------------------------
// 4.4  CLASSE_ALTITUDE_TYPES — Classes d'altitude (DPE)
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_classe_altitude_id (string 1-3)
// L'altitude module les degrés-jours, pas la zone climatique.
// ----------------------------------------------------------------------------

export const CLASSE_ALTITUDE_TYPES = [
  {
    code: "altitude_inf_400m",
    label_fr: "Altitude < 400 m",
    synonyms: ["plaine", "altitude basse", "moins de 400 m"],
    ademe_id: "1",
    ademe_code: "Altitude inférieure à 400 m",
  },
  {
    code: "altitude_400_800m",
    label_fr: "Altitude 400 à 800 m",
    synonyms: ["moyenne montagne basse", "400-800 m"],
    ademe_id: "2",
    ademe_code: "Altitude 400 à 800 m",
  },
  {
    code: "altitude_sup_800m",
    label_fr: "Altitude > 800 m",
    synonyms: ["montagne", "altitude haute", "plus de 800 m"],
    ademe_id: "3",
    ademe_code: "Altitude supérieure à 800 m",
    note: "En zones H1b, H1c, H2d > 800 m → seuils E/F/G modulés",
  },
] as const;

export type ClasseAltitudeCode = typeof CLASSE_ALTITUDE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 4.5  PERIODE_CONSTRUCTION_TYPES — Période de construction
// ----------------------------------------------------------------------------
// Source : 06b_3cl_xml_enumerations.md → enum_periode_construction_id (string 1-10)
// Les valeurs U forfaitaires (umur, upb, uph) dépendent fortement de la période.
// ----------------------------------------------------------------------------

export const PERIODE_CONSTRUCTION_TYPES = [
  {
    code: "avant_1948",
    label_fr: "Avant 1948",
    synonyms: ["ancien", "avant guerre", "patrimonial", "haussmannien"],
    ademe_id: "1",
    ademe_code: "Avant 1948",
    contexte_reglementaire: "Aucune réglementation thermique",
  },
  {
    code: "1948_1974",
    label_fr: "1948 - 1974",
    synonyms: ["reconstruction", "trente glorieuses", "années 50-60-70 début"],
    ademe_id: "2",
    ademe_code: "1948-1974",
    contexte_reglementaire: "Reconstruction, pas de RT",
  },
  {
    code: "1975_1977",
    label_fr: "1975 - 1977",
    synonyms: ["RT74 début", "premier choc pétrolier"],
    ademe_id: "3",
    ademe_code: "1975-1977",
    contexte_reglementaire: "Première RT (1974)",
  },
  {
    code: "1978_1982",
    label_fr: "1978 - 1982",
    synonyms: ["RT74 améliorée", "fin années 70"],
    ademe_id: "4",
    ademe_code: "1978-1982",
    contexte_reglementaire: "RT 1974 améliorée",
  },
  {
    code: "1983_1988",
    label_fr: "1983 - 1988",
    synonyms: ["RT82", "années 80"],
    ademe_id: "5",
    ademe_code: "1983-1988",
    contexte_reglementaire: "RT 1982",
  },
  {
    code: "1989_2000",
    label_fr: "1989 - 2000",
    synonyms: ["RT88", "années 90"],
    ademe_id: "6",
    ademe_code: "1989-2000",
    contexte_reglementaire: "RT 1988",
  },
  {
    code: "2001_2005",
    label_fr: "2001 - 2005",
    synonyms: ["RT2000", "début années 2000"],
    ademe_id: "7",
    ademe_code: "2001-2005",
    contexte_reglementaire: "RT 2000",
  },
  {
    code: "2006_2012",
    label_fr: "2006 - 2012",
    synonyms: ["RT2005", "années 2005-2012"],
    ademe_id: "8",
    ademe_code: "2006-2012",
    contexte_reglementaire: "RT 2005",
  },
  {
    code: "2013_2021",
    label_fr: "2013 - 2021",
    synonyms: ["RT2012", "BBC", "construction récente"],
    ademe_id: "9",
    ademe_code: "2013-2021",
    contexte_reglementaire: "RT 2012",
  },
  {
    code: "apres_2021",
    label_fr: "Après 2021",
    synonyms: ["RE2020", "construction neuve récente"],
    ademe_id: "10",
    ademe_code: "Après 2021",
    contexte_reglementaire: "RE 2020",
  },
] as const;

export type PeriodeConstructionCode = typeof PERIODE_CONSTRUCTION_TYPES[number]["code"];

// ============================================================================
// 5. ASPECTS RÉGLEMENTAIRES DPE
// ============================================================================

// ----------------------------------------------------------------------------
// 5.1  METHODE_DPE_TYPES — Méthodes de calcul DPE applicables
// ----------------------------------------------------------------------------
// Source : reference_3cl_ia.md, 04a_dpe_collectif_copropriete.md,
// arrêté du 31/03/2021 modifié + arrêté du 25/03/2024 (Sref).
//
// Note : la méthode "factures" est SUPPRIMÉE pour les logements depuis
// 01/07/2021. Elle subsiste uniquement pour le tertiaire.
// ----------------------------------------------------------------------------

export const METHODE_DPE_TYPES = [
  {
    code: "dpe_3cl_2021_logement_existant",
    label_fr: "DPE 3CL 2021 — Logement existant (vente / location)",
    synonyms: ["3CL", "DPE existant", "DPE vente", "DPE location"],
    ademe_code: "Méthode 3CL-DPE 2021 — logement existant",
    cep_electricite: 1.9, // Depuis 01/01/2026
  },
  {
    code: "dpe_3cl_2021_logement_neuf",
    label_fr: "DPE neuf — Logement RE2020",
    synonyms: ["DPE neuf", "DPE RE2020", "DPE construction"],
    ademe_code: "DPE neuf — RE2020",
    cep_electricite: 2.3, // Maintien RE2020
  },
  {
    code: "dpe_3cl_immeuble_collectif",
    label_fr: "DPE collectif — Immeuble entier (THCex / 3CL collectif)",
    synonyms: ["DPE immeuble", "DPE collectif", "THCex", "DPE copropriété"],
    ademe_code: "DPE collectif d'immeuble",
    cep_electricite: 1.9,
  },
  {
    code: "dpe_3cl_appartement_a_partir_immeuble",
    label_fr: "DPE appartement à partir du DPE collectif (génération individuelle)",
    synonyms: ["DPE individuel généré", "DPE app. à partir collectif"],
    ademe_code: "DPE individuel généré à partir d'un DPE collectif",
    cep_electricite: 1.9,
  },
  {
    code: "audit_energetique_reglementaire",
    label_fr: "Audit énergétique réglementaire (vente F/G/E)",
    synonyms: ["audit réglementaire", "audit vente", "audit obligatoire", "audit méthode 3CL"],
    ademe_code: "Audit énergétique réglementaire (méthode 3CL)",
    cep_electricite: 1.9,
  },
  {
    code: "audit_energetique_incitatif_mpr",
    label_fr: "Audit énergétique incitatif (rénovation d'ampleur MPR)",
    synonyms: ["audit incitatif", "audit MPR", "audit rénovation d'ampleur"],
    ademe_code: "Audit énergétique incitatif (méthode 3CL)",
    cep_electricite: 1.9,
  },
  {
    code: "dpe_pre_2021_obsolete",
    label_fr: "DPE pré-2021 (méthode obsolète, non opposable)",
    synonyms: ["ancien DPE", "DPE factures", "DPE avant réforme"],
    ademe_code: "DPE antérieur réforme 2021 — obsolète",
    note: "Plus valable : DPE avant 2018 + DPE 2018-2021 expiré au 31/12/2024",
    obsolete: true,
  },
] as const;

export type MethodeDpeCode = typeof METHODE_DPE_TYPES[number]["code"];

// ----------------------------------------------------------------------------
// 5.2  STATUT_DPE_TYPES — Statut du document DPE
// ----------------------------------------------------------------------------
// Statut administratif et opérationnel d'un DPE / audit dans le contexte
// d'une mission Energyco.
// ----------------------------------------------------------------------------

export const STATUT_DPE_TYPES = [
  {
    code: "dpe_valide_en_cours",
    label_fr: "DPE valide (en cours de validité, < 10 ans)",
    synonyms: ["DPE valide", "DPE OK", "en cours"],
    duree_validite_ans: 10,
  },
  {
    code: "dpe_expire",
    label_fr: "DPE expiré (> 10 ans ou hors période transitoire)",
    synonyms: ["DPE expiré", "périmé", "obsolète"],
  },
  {
    code: "dpe_pour_vente",
    label_fr: "DPE — usage vente",
    synonyms: ["DPE vente", "diagnostic vente"],
    contexte_legal: "Obligatoire pour toute mise en vente",
  },
  {
    code: "dpe_pour_location",
    label_fr: "DPE — usage location",
    synonyms: ["DPE location", "diagnostic location"],
    contexte_legal: "Obligatoire pour mise en location + interdictions passoires",
  },
  {
    code: "dpe_neuf_construction",
    label_fr: "DPE — bâtiment neuf (RE2020)",
    synonyms: ["DPE neuf", "DPE construction"],
    contexte_legal: "À la livraison construction neuve",
  },
  {
    code: "dpe_collectif",
    label_fr: "DPE collectif (immeuble en copropriété)",
    synonyms: ["DPE copro", "DPE immeuble"],
    contexte_legal: "Obligatoire copro selon calendrier 2024-2026 (lots ≥ 51 / 50 / autres)",
  },
  {
    code: "audit_reglementaire_obligatoire",
    label_fr: "Audit énergétique réglementaire (obligatoire vente passoire)",
    synonyms: ["audit obligatoire vente", "audit F/G/E"],
    contexte_legal: "Obligatoire pour vente classes F/G (depuis 01/04/2023) et E (depuis 01/01/2025)",
  },
  {
    code: "audit_incitatif_mpr",
    label_fr: "Audit énergétique incitatif (MPR rénovation d'ampleur)",
    synonyms: ["audit MPR", "audit rénovation ampleur"],
    contexte_legal: "Préalable obligatoire à MaPrimeRénov' Parcours accompagné",
  },
  {
    code: "dpe_projete_post_travaux",
    label_fr: "DPE projeté (estimation post-travaux)",
    synonyms: ["DPE projeté", "DPE post-travaux", "DPE simulation"],
    contexte_legal: "Pour PPT, MPR, projection après scénario de travaux",
  },
  {
    code: "dpe_invalide_erreur_saisie",
    label_fr: "DPE invalide (erreur saisie / contestation)",
    synonyms: ["DPE contesté", "DPE erroné", "DPE à refaire"],
    contexte_legal: "DPE opposable depuis 2021 — engagement responsabilité diagnostiqueur",
  },
] as const;

export type StatutDpeCode = typeof STATUT_DPE_TYPES[number]["code"];

// ============================================================================
// EXPORT AGRÉGÉ — TROIS_CL_DPE_NOMENCLATURE
// ============================================================================

export const TROIS_CL_DPE_NOMENCLATURE = {
  // Enveloppe
  MUR_TYPES,
  MUR_ISOLANT_TYPES,
  MUR_ISOLATION_POSITION_TYPES,
  PLANCHER_BAS_TYPES,
  PLANCHER_HAUT_TYPES,
  MENUISERIE_VITRAGE_TYPES,
  MENUISERIE_DORMANT_TYPES,
  MENUISERIE_TYPE_OUVRANT_TYPES,
  PORTE_TYPES,
  PROTECTION_SOLAIRE_TYPES,
  PONT_THERMIQUE_TYPES,

  // Systèmes énergétiques
  CHAUFFAGE_GENERATEUR_TYPES,
  CHAUFFAGE_EMETTEUR_TYPES,
  CHAUFFAGE_REGULATION_TYPES,
  ECS_GENERATEUR_TYPES,
  VENTILATION_TYPES_3CL,
  CLIMATISATION_TYPES,
  ENERGIES_VECTEURS,
  PRODUCTION_LOCALE_TYPES,

  // Inertie & étanchéité
  INERTIE_THERMIQUE_TYPES,
  PERMEABILITE_AIR_TYPES,

  // Classes & étiquettes
  ETIQUETTE_DPE_ENERGIE,
  ETIQUETTE_DPE_GES,
  ZONE_CLIMATIQUE_FR,
  CLASSE_ALTITUDE_TYPES,
  PERIODE_CONSTRUCTION_TYPES,

  // Aspects réglementaires
  METHODE_DPE_TYPES,
  STATUT_DPE_TYPES,
} as const;

export type TroisClDpeNomenclatureKey = keyof typeof TROIS_CL_DPE_NOMENCLATURE;

// ----------------------------------------------------------------------------
// CONSTANTES RÉGLEMENTAIRES 3CL — Valeurs fondamentales
// ----------------------------------------------------------------------------
// Valeurs réglementaires officielles à exposer sous forme constante typée.
// ----------------------------------------------------------------------------

export const TROIS_CL_DPE_CONSTANTES = {
  // Coefficients d'énergie primaire (Cep)
  cep_electricite_dpe_existant_depuis_2026: 1.9,
  cep_electricite_dpe_existant_avant_2026: 2.3,
  cep_electricite_re2020_neuf: 2.3,
  cep_gaz_naturel: 1.0,
  cep_fioul: 1.0,
  cep_bois: 1.0,
  cep_gpl: 1.0,

  // Résistances thermiques superficielles (NF EN ISO 6946)
  rsi_paroi_verticale_m2k_w: 0.13,
  rse_paroi_verticale_m2k_w: 0.04,
  rsi_paroi_horizontale_flux_ascendant_m2k_w: 0.10,
  rsi_paroi_horizontale_flux_descendant_m2k_w: 0.17,
  rse_paroi_horizontale_m2k_w: 0.04,

  // Seuils passoire thermique
  seuil_classe_f_cep_max: 420,
  seuil_classe_f_eges_max: 100,
  seuil_passoire_thermique_classe: ["classe_f", "classe_g"] as const,

  // Validité documents
  duree_validite_dpe_ans: 10,
  duree_validite_dpe_pre_2021_jusqu_au: "2024-12-31",

  // Calendrier interdictions location passoires (métropole)
  interdiction_location_g_consommation_finale_kwh_m2_an: 450, // Depuis 01/01/2025 (logement décent)
  interdiction_location_classe_g_date: "2025-01-01", // Logements > 450 kWh/m²/an EF
  interdiction_location_classe_g_complete_date: "2028-01-01",
  interdiction_location_classe_f_date: "2028-01-01",
  interdiction_location_classe_e_date: "2034-01-01",

  // Surface de référence (depuis arrêté 25/03/2024 - en vigueur 01/07/2024)
  surface_de_reference_remplace_surface_habitable: true,
  surface_de_reference_depuis: "2024-07-01",

  // Tarif petites surfaces
  seuil_correction_petite_surface_m2: 40,
  petites_surfaces_seuils_arrete_du: "2024-03-25",

  // 5 postes énergétiques DPE
  postes_energetiques: ["chauffage", "ecs", "refroidissement", "eclairage", "auxiliaires"] as const,
} as const;

export type TroisClDpeConstantesKey = keyof typeof TROIS_CL_DPE_CONSTANTES;

// ----------------------------------------------------------------------------
// HELPERS DE TYPAGE — Codes union types pour validation runtime
// ----------------------------------------------------------------------------

export type AnyTroisClDpeCode =
  | MurCode
  | MurIsolantCode
  | MurIsolationPositionCode
  | PlancherBasCode
  | PlancherHautCode
  | MenuiserieVitrageCode
  | MenuiserieDormantCode
  | MenuiserieTypeOuvrantCode
  | PorteCode
  | ProtectionSolaireCode
  | PontThermiqueCode
  | ChauffageGenerateurCode
  | ChauffageEmetteurCode
  | ChauffageRegulationCode
  | EcsGenerateurCode
  | VentilationCode3CL
  | ClimatisationCode
  | EnergieVecteurCode
  | ProductionLocaleCode
  | InertieThermiqueCode
  | PermeabiliteAirCode
  | EtiquetteDpeEnergieCode
  | EtiquetteDpeGesCode
  | ZoneClimatiqueFrCode
  | ClasseAltitudeCode
  | PeriodeConstructionCode
  | MethodeDpeCode
  | StatutDpeCode;
