/**
 * VTU — Nomenclature canonique PPPT (méthode Energyco)
 * ==========================================================
 *
 * Source primaire : Project Knowledge Energyco — base RAG copropriété
 *   - 05a_dtg_*  (DTG : 4 volets, rapport type)
 *   - 05b_ppt_*  (PPPT : contenu obligatoire art. 14-2 loi 1965, types travaux)
 *   - 09_tech_*  (pathologies bâtiment STR/ENV/HUM/BIO/HAZ/PLB/ELC/CVC)
 *   - 04b_*, 04c_*, 06b_AIDES_*  (équipements chauffage, ECS, ventilation, ascenseurs)
 *   - 13a_systemes_pac_hydraulique, 14a/b/c, 15a, 20a/b
 *
 * Périmètre : éléments faisant l'objet de travaux planifiés sur 10 ans
 *             dans un Plan Pluriannuel de Travaux (loi ELAN, copros ≥ 15 ans).
 *
 * Doctrine VTU : liste fermée. Si Gemini ne match aucun code → custom_field.
 *
 * Date : 2026-04-26
 * Auteur : Energyco (Omar) + assistant RAG
 */

// =============================================================================
// 1. ENVELOPPE — TOITURE
// =============================================================================

export const TOITURE_TYPES = [
  {
    code: "toiture_terrasse_etancheite_bitume",
    label_fr: "Toiture-terrasse — étanchéité bitumineuse multicouche",
    synonyms: ["toit terrasse bitume", "étanchéité bitume", "asphalte coulé", "membrane bitumineuse", "SBS"],
    typical_lifespan_years: 25, // Source : ENV-T02, durée vie bitume 20-25 ans
    common_pathologies: ["cloquage_etancheite", "decollement_releve", "fissuration_membrane", "infiltration_terrasse", "stagnation_eau"],
  },
  {
    code: "toiture_terrasse_etancheite_synthetique",
    label_fr: "Toiture-terrasse — étanchéité membrane synthétique (PVC, EPDM, TPO)",
    synonyms: ["EPDM", "PVC toiture", "TPO", "membrane synthétique", "FPO"],
    typical_lifespan_years: 30,
    common_pathologies: ["dechirure_membrane", "decollement_releve", "infiltration_terrasse"],
  },
  {
    code: "toiture_terrasse_accessible_dalles",
    label_fr: "Toiture-terrasse accessible — protection lourde dalles sur plots",
    synonyms: ["terrasse circulable", "dalles sur plots", "terrasse jardin", "dalles béton"],
    typical_lifespan_years: 25,
    common_pathologies: ["fissuration_dalles", "decollement_releve", "stagnation_eau"],
  },
  {
    code: "toiture_terrasse_vegetalisee",
    label_fr: "Toiture-terrasse végétalisée",
    synonyms: ["toiture verte", "toit végétal", "végétalisation extensive", "végétalisation intensive"],
    typical_lifespan_years: 25,
    common_pathologies: ["infiltration_terrasse", "obstruction_evacuation_ep", "compatibilite_etancheite"],
  },
  {
    code: "toiture_pente_tuiles_terre_cuite",
    label_fr: "Toiture en pente — tuiles terre cuite",
    synonyms: ["tuile mécanique", "tuile canal", "tuile plate", "tuile romane", "tuile à emboîtement"],
    typical_lifespan_years: 80,
    common_pathologies: ["tuile_cassee_deplacee", "mousse_lichen", "defaut_faitage", "defaut_noue", "infiltration_toiture"],
  },
  {
    code: "toiture_pente_ardoise_naturelle",
    label_fr: "Toiture en pente — ardoise naturelle",
    synonyms: ["ardoise", "schiste", "ardoise d'Angers", "ardoise espagnole"],
    typical_lifespan_years: 100,
    common_pathologies: ["ardoise_glissee", "ardoise_cassee", "crochet_oxyde", "solin_decolle"],
  },
  {
    code: "toiture_pente_ardoise_fibrociment",
    label_fr: "Toiture en pente — ardoise fibrociment",
    synonyms: ["fibrociment", "Eternit", "ardoise artificielle"],
    typical_lifespan_years: 50,
    common_pathologies: ["amiante_suspect_avant_1997", "casse_fragile", "porosite_vieillissement"],
  },
  {
    code: "toiture_pente_zinc",
    label_fr: "Toiture en pente — bac/feuilles de zinc",
    synonyms: ["zinc", "zinc à joint debout", "couverture zinc"],
    typical_lifespan_years: 80,
    common_pathologies: ["corrosion_zinc", "perforation", "defaut_soudure"],
  },
  {
    code: "toiture_pente_bac_acier",
    label_fr: "Toiture en pente — bac acier",
    synonyms: ["bac acier", "tôle ondulée", "panneau sandwich"],
    typical_lifespan_years: 30,
    common_pathologies: ["corrosion_bac", "boulon_corrode", "joint_defaillant", "cloque_rouille"],
  },
  {
    code: "toiture_charpente_bois",
    label_fr: "Charpente bois (combles, fermes traditionnelles ou industrielles)",
    synonyms: ["charpente traditionnelle", "fermettes", "ferme américaine", "panne", "chevron"],
    typical_lifespan_years: 100,
    common_pathologies: ["xylophages_vrillette_capricorne", "merule_pourriture_cubique", "fleche_excessive", "humidite_bois"],
  },
  {
    code: "toiture_charpente_metallique",
    label_fr: "Charpente métallique (IPE, profilés acier)",
    synonyms: ["charpente métal", "IPE", "structure acier", "ferme métallique"],
    typical_lifespan_years: 80,
    common_pathologies: ["corrosion_charpente", "ecaillage_anticorrosion", "boulon_desserre", "fissure_soudure"],
  },
  {
    code: "toiture_zinguerie",
    label_fr: "Zinguerie — chéneaux, gouttières, descentes EP, solins",
    synonyms: ["chéneau", "gouttière", "descente EP", "solin", "noquet", "abergement"],
    typical_lifespan_years: 40,
    common_pathologies: ["corrosion_zinguerie", "deboitement_descente", "deformation_chenau", "obstruction_feuilles"],
  },
  {
    code: "toiture_isolation_combles_perdus",
    label_fr: "Isolation des combles perdus (soufflage)",
    synonyms: ["combles perdus", "soufflage laine", "isolant en vrac", "ouate de cellulose"],
    typical_lifespan_years: 30,
    common_pathologies: ["isolant_tasse", "isolant_imbibe", "isolant_absent_peripherique", "obstruction_chatieres"],
  },
  {
    code: "toiture_isolation_combles_amenages",
    label_fr: "Isolation des combles aménagés (rampants)",
    synonyms: ["rampants", "combles habités", "isolation sous-toiture", "sarking"],
    typical_lifespan_years: 40,
    common_pathologies: ["pont_thermique_rampant", "condensation_sous_toiture", "tassement_isolant"],
  },
] as const;

export type ToitureCode = typeof TOITURE_TYPES[number]["code"];

// =============================================================================
// 2. ENVELOPPE — FAÇADE
// =============================================================================

export const FACADE_TYPES = [
  {
    code: "facade_pierre_taille",
    label_fr: "Façade en pierre de taille (haussmannien, immeubles anciens)",
    synonyms: ["pierre de taille", "haussmannien", "calcaire", "façade ABF"],
    typical_lifespan_years: 200,
    common_pathologies: ["encrassement", "desquamation_pierre", "joint_dégradé", "salissures_biologiques"],
  },
  {
    code: "facade_brique_apparente",
    label_fr: "Façade en brique apparente",
    synonyms: ["brique", "brique pleine", "parement brique", "brique terre cuite"],
    typical_lifespan_years: 150,
    common_pathologies: ["joint_degrade", "efflorescences_salpetre", "gel_degel", "fissure_maçonnerie"],
  },
  {
    code: "facade_enduit_traditionnel_chaux",
    label_fr: "Façade enduit traditionnel à la chaux",
    synonyms: ["enduit chaux", "enduit traditionnel", "crépi chaux"],
    typical_lifespan_years: 60,
    common_pathologies: ["fissure_capillaire", "decollement_enduit", "efflorescences_salpetre", "cloquage_peinture"],
  },
  {
    code: "facade_enduit_ciment_monocouche",
    label_fr: "Façade enduit ciment / monocouche",
    synonyms: ["enduit monocouche", "enduit ciment", "RPE", "revêtement plastique épais"],
    typical_lifespan_years: 30,
    common_pathologies: ["fissure_retrait", "decollement_enduit", "fissuration_traversante", "infiltration"],
  },
  {
    code: "facade_beton_brut",
    label_fr: "Façade béton brut (banché, préfa)",
    synonyms: ["béton apparent", "voile béton", "panneau préfabriqué", "béton banché"],
    typical_lifespan_years: 80,
    common_pathologies: ["carbonatation_beton", "corrosion_armatures", "eclat_beton_delaminage", "fissure_structurelle"],
  },
  {
    code: "facade_ite_etics_pse",
    label_fr: "Façade ITE — système ETICS isolant PSE",
    synonyms: ["ITE", "ETICS", "polystyrène expansé", "isolation extérieure", "doublage extérieur"],
    typical_lifespan_years: 30,
    common_pathologies: ["decollement_panneaux", "fissure_horizontale", "algues_enduit_poreux", "desaffleur_panneaux", "humidite_isolant"],
  },
  {
    code: "facade_ite_etics_laine_minerale",
    label_fr: "Façade ITE — système ETICS isolant laine minérale",
    synonyms: ["ITE laine de roche", "ITE laine de verre", "ETICS LM"],
    typical_lifespan_years: 30,
    common_pathologies: ["decollement_panneaux", "fissure_horizontale", "humidite_isolant", "tassement_isolant"],
  },
  {
    code: "facade_ite_bardage_rapporte",
    label_fr: "Façade ITE — bardage ventilé rapporté",
    synonyms: ["bardage ventilé", "vêture", "vêtage", "bardage bois", "bardage métal", "fibrociment"],
    typical_lifespan_years: 40,
    common_pathologies: ["dilatation_fixation", "infiltration_lame_air", "vieillissement_parement"],
  },
  {
    code: "facade_iti_doublage_interieur",
    label_fr: "Doublage intérieur (ITI) collé ou sur ossature",
    synonyms: ["ITI", "doublage collé", "complexe BA13+isolant", "contre-cloison"],
    typical_lifespan_years: 50,
    common_pathologies: ["pont_thermique_perimetrique", "condensation_interstitielle", "decollement_doublage"],
  },
  {
    code: "facade_bardage_bois",
    label_fr: "Bardage bois (clins, lames)",
    synonyms: ["clins bois", "lames bois", "Douglas", "mélèze", "red cedar"],
    typical_lifespan_years: 40,
    common_pathologies: ["grisaillement", "champignons_bois", "fixation_corrodee"],
  },
  {
    code: "facade_balcon_dalle_beton",
    label_fr: "Balcon en dalle béton armé (encastré)",
    synonyms: ["balcon béton", "dalle balcon", "balcon filant"],
    typical_lifespan_years: 60,
    common_pathologies: ["corrosion_armatures_balcon", "carbonatation_beton", "eclatement_nez_dalle", "etancheite_balcon", "carrelage_decolle"],
  },
  {
    code: "facade_balcon_metallique",
    label_fr: "Balcon métallique (rapporté ou coursive)",
    synonyms: ["balcon acier", "coursive métal", "balcon en porte-à-faux acier"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_metallerie", "fixation_dégradée", "platelage_dégradé"],
  },
  {
    code: "facade_loggia_couverte",
    label_fr: "Loggia (renfoncement couvert intégré au volume bâti)",
    synonyms: ["loggia", "balcon couvert", "loggia fermée"],
    typical_lifespan_years: 60,
    common_pathologies: ["etancheite_sol_loggia", "infiltration_sous_face", "garde_corps_corrode"],
  },
  {
    code: "facade_garde_corps_metallique",
    label_fr: "Garde-corps métallique (ferronnerie, acier, alu)",
    synonyms: ["garde-corps fer", "ferronnerie", "garde-corps alu", "rambarde"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_garde_corps", "scellement_dégradé", "non_conformite_hauteur_remplissage"],
  },
  {
    code: "facade_garde_corps_verre",
    label_fr: "Garde-corps en verre feuilleté",
    synonyms: ["garde-corps verre", "panneau verre feuilleté", "verre trempé"],
    typical_lifespan_years: 30,
    common_pathologies: ["fissuration_verre", "fixation_dégradée", "joint_silicone_dégradé"],
  },
  // TODO Omar à valider : ajouter facade_pan_de_bois (colombage) si pertinent
] as const;

export type FacadeCode = typeof FACADE_TYPES[number]["code"];

// =============================================================================
// 3. ENVELOPPE — MENUISERIES EXTÉRIEURES
// =============================================================================

export const MENUISERIE_TYPES = [
  {
    code: "menuiserie_fenetre_bois_simple_vitrage",
    label_fr: "Fenêtre bois — simple vitrage",
    synonyms: ["fenêtre bois SV", "menuiserie ancienne", "châssis bois"],
    typical_lifespan_years: 50,
    common_pathologies: ["pont_thermique_dormant", "joint_defaillant", "infiltration_air", "peinture_ecaillee", "vieillissement_bois"],
  },
  {
    code: "menuiserie_fenetre_bois_double_vitrage",
    label_fr: "Fenêtre bois — double vitrage",
    synonyms: ["fenêtre bois DV", "fenêtre bois moderne"],
    typical_lifespan_years: 40,
    common_pathologies: ["bris_scellement_vitrage", "joint_defaillant", "peinture_ecaillee"],
  },
  {
    code: "menuiserie_fenetre_pvc_double_vitrage",
    label_fr: "Fenêtre PVC — double vitrage",
    synonyms: ["fenêtre PVC", "châssis PVC", "fenêtre blanche PVC"],
    typical_lifespan_years: 30,
    common_pathologies: ["joint_defaillant", "deformation_thermique", "bris_scellement_vitrage"],
  },
  {
    code: "menuiserie_fenetre_alu_double_vitrage",
    label_fr: "Fenêtre aluminium avec rupture de pont thermique — double vitrage",
    synonyms: ["fenêtre alu RPT", "menuiserie aluminium", "châssis alu"],
    typical_lifespan_years: 40,
    common_pathologies: ["joint_defaillant", "bris_scellement_vitrage", "condensation_dormant"],
  },
  {
    code: "menuiserie_fenetre_alu_sans_rpt",
    label_fr: "Fenêtre aluminium sans rupture de pont thermique (ancienne)",
    synonyms: ["alu sans RPT", "ancien châssis alu"],
    typical_lifespan_years: 40,
    common_pathologies: ["pont_thermique_majeur", "condensation_dormant", "bris_scellement_vitrage"],
  },
  {
    code: "menuiserie_fenetre_mixte_bois_alu",
    label_fr: "Fenêtre mixte bois-aluminium",
    synonyms: ["mixte bois-alu", "intérieur bois extérieur alu"],
    typical_lifespan_years: 50,
    common_pathologies: ["joint_defaillant", "infiltration_jonction_alu_bois"],
  },
  {
    code: "menuiserie_porte_entree_immeuble",
    label_fr: "Porte d'entrée d'immeuble (parties communes)",
    synonyms: ["porte hall", "porte palière hall", "porte d'accès"],
    typical_lifespan_years: 40,
    common_pathologies: ["serrure_dégradée", "ferme_porte_hs", "joint_defaillant", "vandalisme"],
  },
  {
    code: "menuiserie_porte_palierre",
    label_fr: "Porte palière de logement (privative)",
    synonyms: ["porte palière", "porte logement", "porte blindée"],
    typical_lifespan_years: 50,
    common_pathologies: ["non_conformite_coupe_feu", "serrure_dégradée", "joint_acoustique_defaillant"],
  },
  {
    code: "menuiserie_porte_garage_collectif",
    label_fr: "Porte de garage / parking collectif (basculante, sectionnelle, à enroulement)",
    synonyms: ["porte parking", "porte basculante", "porte sectionnelle", "rideau métallique"],
    typical_lifespan_years: 30,
    common_pathologies: ["motorisation_hs", "ressort_dégradé", "vétusté_tablier", "non_conformite_securite"],
  },
  {
    code: "menuiserie_volet_battant_bois",
    label_fr: "Volet battant bois (persiennes, contrevents)",
    synonyms: ["persienne bois", "contrevent", "volet bois"],
    typical_lifespan_years: 40,
    common_pathologies: ["peinture_ecaillee", "gond_corrode", "lame_fendue"],
  },
  {
    code: "menuiserie_volet_roulant_traditionnel",
    label_fr: "Volet roulant traditionnel (caisson maçonné, tablier PVC/alu)",
    synonyms: ["volet roulant", "VR", "tablier PVC", "tablier alu"],
    typical_lifespan_years: 25,
    common_pathologies: ["caisson_non_isole_pont_thermique", "lame_cassee", "manoeuvre_hs", "moteur_hs"],
  },
  {
    code: "menuiserie_volet_roulant_renove_isole",
    label_fr: "Volet roulant rénové avec caisson isolé (bloc-baie)",
    synonyms: ["bloc-baie", "VR isolé", "rénovation VR"],
    typical_lifespan_years: 25,
    common_pathologies: ["motorisation_hs", "tablier_dégradé"],
  },
  {
    code: "menuiserie_store_brise_soleil",
    label_fr: "Store extérieur / brise-soleil (protection solaire)",
    synonyms: ["BSO", "brise-soleil orientable", "store banne", "screen extérieur"],
    typical_lifespan_years: 20,
    common_pathologies: ["motorisation_hs", "toile_dégradée", "fixation_corrodee"],
  },
] as const;

export type MenuiserieCode = typeof MENUISERIE_TYPES[number]["code"];

// =============================================================================
// 4. STRUCTURE & FONDATIONS
// =============================================================================

export const STRUCTURE_TYPES = [
  {
    code: "structure_beton_arme_voiles",
    label_fr: "Structure béton armé — voiles porteurs (immeubles ≥ 1950)",
    synonyms: ["voiles béton", "BA", "structure poteaux-poutres BA", "voiles porteurs"],
    typical_lifespan_years: 100,
    common_pathologies: ["fissure_structurelle", "carbonatation_beton", "corrosion_armatures", "eclatement_beton"],
  },
  {
    code: "structure_maconnerie_pierre",
    label_fr: "Structure maçonnerie pierre (immeubles anciens, < 1900)",
    synonyms: ["mur pierre porteur", "maçonnerie traditionnelle", "moellons"],
    typical_lifespan_years: 200,
    common_pathologies: ["joint_dégradé", "fissure_maçonnerie", "humidite_remontee_capillaire", "tassement"],
  },
  {
    code: "structure_maconnerie_brique",
    label_fr: "Structure maçonnerie brique (1900-1950)",
    synonyms: ["mur porteur brique", "brique pleine", "brique de Vaugirard"],
    typical_lifespan_years: 150,
    common_pathologies: ["joint_dégradé", "fissure_maconnerie", "salpetre", "gel_degel"],
  },
  {
    code: "structure_pan_de_bois_colombage",
    label_fr: "Structure pan de bois / colombages (très ancien, < 1850)",
    synonyms: ["colombage", "pan de bois", "à pans de bois"],
    typical_lifespan_years: 300,
    common_pathologies: ["xylophages", "merule", "humidite_bois", "tassement_differentiel"],
  },
  {
    code: "structure_mixte_pierre_brique",
    label_fr: "Structure mixte pierre + brique (façade pierre / refends brique)",
    synonyms: ["mixte pierre brique", "façade pierre intérieur brique"],
    typical_lifespan_years: 150,
    common_pathologies: ["fissure_jonction_materiaux", "humidite", "joint_degrade"],
  },
  {
    code: "structure_metallique_acier",
    label_fr: "Structure métallique acier (immeubles industriels, halles)",
    synonyms: ["ossature métallique", "structure acier", "IPN"],
    typical_lifespan_years: 80,
    common_pathologies: ["corrosion_charpente", "ecaillage_anticorrosion", "deformation"],
  },
] as const;

export type StructureCode = typeof STRUCTURE_TYPES[number]["code"];

export const FONDATION_TYPES = [
  {
    code: "fondation_superficielle_semelle_filante",
    label_fr: "Fondation superficielle — semelle filante",
    synonyms: ["semelle filante", "semelle continue", "fondation semelle"],
    typical_lifespan_years: 100,
    common_pathologies: ["tassement_differentiel", "rga_retrait_argile", "humidite_remontee_capillaire"],
  },
  {
    code: "fondation_superficielle_radier",
    label_fr: "Fondation superficielle — radier général",
    synonyms: ["radier", "dalle de fondation"],
    typical_lifespan_years: 100,
    common_pathologies: ["fissure_radier", "tassement_general", "infiltration_eau_souterraine"],
  },
  {
    code: "fondation_profonde_pieux",
    label_fr: "Fondation profonde — pieux ou puits",
    synonyms: ["pieux", "micropieux", "puits forés", "fondation profonde"],
    typical_lifespan_years: 100,
    common_pathologies: ["corrosion_pieux_metalliques", "tassement"],
  },
  {
    code: "fondation_inconnue_non_visible",
    label_fr: "Fondation non visible / non documentée",
    synonyms: ["fondations inaccessibles", "non documenté"],
    typical_lifespan_years: 0, // inconnu
    common_pathologies: ["tassement_differentiel", "humidite_remontee_capillaire"],
  },
] as const;

export type FondationCode = typeof FONDATION_TYPES[number]["code"];

// =============================================================================
// 5. SYSTÈMES TECHNIQUES — CHAUFFAGE COLLECTIF
// =============================================================================

export const CHAUFFAGE_COLLECTIF_TYPES = [
  {
    code: "ch_coll_chaudiere_gaz_atmospherique",
    label_fr: "Chaudière gaz atmosphérique collective (sans condensation)",
    synonyms: ["chaudière gaz standard", "chaudière atmo", "chaudière basse température"],
    typical_lifespan_years: 25,
    common_pathologies: ["rendement_dégradé", "corrosion_corps_chauffe", "vétusté_brûleur", "non_conforme_RT"],
  },
  {
    code: "ch_coll_chaudiere_gaz_condensation",
    label_fr: "Chaudière gaz à condensation collective",
    synonyms: ["chaudière condensation", "chaudière HPE", "chaudière THPE"],
    typical_lifespan_years: 25,
    common_pathologies: ["encrassement_echangeur", "vétusté_brûleur", "défaut_évacuation_condensats"],
  },
  {
    code: "ch_coll_chaudiere_fioul",
    label_fr: "Chaudière fioul collective",
    synonyms: ["chaudière fioul", "chaudière mazout", "chaudière FOD"],
    typical_lifespan_years: 25,
    common_pathologies: ["vétusté_brûleur", "encrassement", "cuve_fioul_dégradée", "obligation_dépose_2026"],
  },
  {
    code: "ch_coll_chaudiere_biomasse_granules",
    label_fr: "Chaudière biomasse à granulés (pellets) collective",
    synonyms: ["chaudière granulés", "chaudière pellets", "biomasse collective"],
    typical_lifespan_years: 20,
    common_pathologies: ["encrassement_echangeur", "vétusté_vis_alimentation", "stockage_silo"],
  },
  {
    code: "ch_coll_pac_air_eau",
    label_fr: "PAC collective air/eau (aérothermie)",
    synonyms: ["PAC air-eau collective", "pompe à chaleur aérothermique"],
    typical_lifespan_years: 20,
    common_pathologies: ["fuite_fluide_frigorigene", "givrage_unite_exterieure", "vétusté_compresseur", "bruit_ue"],
  },
  {
    code: "ch_coll_pac_eau_eau_geothermie",
    label_fr: "PAC collective eau/eau géothermique (sondes ou nappe)",
    synonyms: ["PAC géothermique", "PAC eau-eau", "géothermie collective"],
    typical_lifespan_years: 25,
    common_pathologies: ["vétusté_compresseur", "encrassement_échangeur", "défaut_sondes_géothermiques"],
  },
  {
    code: "ch_coll_pac_hybride_gaz",
    label_fr: "Système PAC hybride (PAC + chaudière gaz condensation)",
    synonyms: ["PAC hybride", "PAC + chaudière", "système bivalent"],
    typical_lifespan_years: 20,
    common_pathologies: ["regulation_complexe", "vétusté_PAC_ou_chaudière"],
  },
  {
    code: "ch_coll_reseau_chaleur_urbain",
    label_fr: "Sous-station raccordée à un réseau de chaleur urbain (CPCU, etc.)",
    synonyms: ["réseau de chaleur", "chauffage urbain", "CPCU", "sous-station"],
    typical_lifespan_years: 30,
    common_pathologies: ["encrassement_echangeur_plaques", "régulation_défaillante", "compteur_énergie_hs"],
  },
  {
    code: "ch_coll_cogeneration",
    label_fr: "Cogénération gaz (production simultanée chaleur + électricité)",
    synonyms: ["cogen", "CHP", "moteur cogénération"],
    typical_lifespan_years: 20,
    common_pathologies: ["vétusté_moteur", "rentabilité_dépendante_tarif_rachat"],
  },
  {
    code: "ch_coll_radiateurs_acier_bouclage",
    label_fr: "Émetteurs — radiateurs acier avec bouclage 2 tubes",
    synonyms: ["radiateur acier", "panneau acier", "bouclage 2 tubes"],
    typical_lifespan_years: 40,
    common_pathologies: ["embouage", "corrosion_radiateur", "absence_robinet_thermostatique", "déséquilibrage_hydraulique"],
  },
  {
    code: "ch_coll_radiateurs_fonte_monotube",
    label_fr: "Émetteurs — radiateurs fonte monotube série (immeuble ancien)",
    synonyms: ["radiateur fonte", "monotube série", "monotube parallèle"],
    typical_lifespan_years: 80,
    common_pathologies: ["embouage", "absence_robinet_thermostatique", "régulation_difficile", "déséquilibrage_hydraulique"],
  },
  {
    code: "ch_coll_plancher_chauffant",
    label_fr: "Émetteurs — plancher chauffant basse température",
    synonyms: ["PCBT", "plancher chauffant", "plancher hydraulique"],
    typical_lifespan_years: 50,
    common_pathologies: ["fuite_serpentin", "embouage", "régulation_défaillante"],
  },
  {
    code: "ch_coll_canalisations_acier_noir",
    label_fr: "Canalisations primaires chauffage — acier noir",
    synonyms: ["acier noir", "tubes acier", "réseau primaire acier"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_interne", "embouage", "calorifuge_dégradé"],
  },
  {
    code: "ch_coll_canalisations_cuivre",
    label_fr: "Canalisations chauffage — cuivre",
    synonyms: ["cuivre chauffage", "tube cuivre"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_électrochimique", "calorifuge_dégradé"],
  },
  {
    code: "ch_coll_calorifuge_reseau",
    label_fr: "Calorifugeage du réseau de distribution chauffage / ECS",
    synonyms: ["calorifuge", "isolation tuyauterie", "isolation réseau", "manchon isolant"],
    typical_lifespan_years: 30,
    common_pathologies: ["calorifuge_absent", "calorifuge_dégradé", "amiante_avant_1997"],
  },
] as const;

export type ChauffageCollectifCode = typeof CHAUFFAGE_COLLECTIF_TYPES[number]["code"];

// =============================================================================
// 6. SYSTÈMES TECHNIQUES — ECS COLLECTIVE
// =============================================================================

export const ECS_COLLECTIVE_TYPES = [
  {
    code: "ecs_coll_ballon_accumulation_gaz",
    label_fr: "Production ECS — ballons d'accumulation chauffés au gaz",
    synonyms: ["ballon ECS gaz", "préparateur ECS gaz", "accumulation gaz"],
    typical_lifespan_years: 20,
    common_pathologies: ["entartrage_serpentin", "corrosion_anode", "isolation_ballon_dégradée"],
  },
  {
    code: "ecs_coll_ballon_accumulation_electrique",
    label_fr: "Production ECS — ballons électriques collectifs",
    synonyms: ["cumulus collectif", "ballon électrique", "ballon stéatite"],
    typical_lifespan_years: 15,
    common_pathologies: ["entartrage_resistance", "corrosion_cuve", "anode_usagee"],
  },
  {
    code: "ecs_coll_echangeur_plaques_semi_instantane",
    label_fr: "Production ECS — échangeur à plaques + ballon de stockage (semi-instantané)",
    synonyms: ["échangeur plaques ECS", "préparateur semi-instantané", "ECS semi-accumulation"],
    typical_lifespan_years: 25,
    common_pathologies: ["entartrage_plaques", "fuite_joint", "régulation_défaillante"],
  },
  {
    code: "ecs_coll_solaire_thermique",
    label_fr: "Production ECS solaire thermique collective (capteurs + ballon bi-énergie)",
    synonyms: ["ECS solaire", "capteurs solaires thermiques", "préchauffage solaire ECS", "CESC"],
    typical_lifespan_years: 25,
    common_pathologies: ["fuite_glycol", "vétusté_capteurs", "régulation_solaire_hs", "stagnation_capteurs"],
  },
  {
    code: "ecs_coll_pac_thermodynamique_collective",
    label_fr: "Production ECS — PAC thermodynamique collective (boiler thermo)",
    synonyms: ["CET collectif", "PAC ECS", "boiler thermodynamique collectif"],
    typical_lifespan_years: 15,
    common_pathologies: ["fuite_fluide", "vétusté_compresseur", "encrassement_évaporateur"],
  },
  {
    code: "ecs_coll_individuelle_par_chaudiere",
    label_fr: "ECS individuelle par chaudière de logement (mixte)",
    synonyms: ["chaudière mixte", "ECS individuelle gaz", "production individuelle"],
    typical_lifespan_years: 20,
    common_pathologies: ["entartrage_échangeur", "vétusté_chaudière"],
  },
  {
    code: "ecs_coll_individuelle_cumulus_electrique",
    label_fr: "ECS individuelle par cumulus électrique de logement",
    synonyms: ["cumulus", "chauffe-eau électrique", "ballon électrique individuel"],
    typical_lifespan_years: 15,
    common_pathologies: ["entartrage_resistance", "anode_usagee", "isolation_dégradée"],
  },
  {
    code: "ecs_coll_bouclage_distribution",
    label_fr: "Réseau ECS bouclé (distribution + circulateur de bouclage)",
    synonyms: ["bouclage ECS", "boucle ECS", "circulateur ECS"],
    typical_lifespan_years: 30,
    common_pathologies: ["pertes_thermiques_bouclage", "calorifuge_absent", "non_respect_55C", "risque_legionellose"],
  },
] as const;

export type EcsCollectiveCode = typeof ECS_COLLECTIVE_TYPES[number]["code"];

// =============================================================================
// 7. SYSTÈMES TECHNIQUES — VENTILATION
// =============================================================================
// Aligné sur les énumérations 3CL DPE (chunk 06b_3cl_xml_enumerations.md)

export const VENTILATION_TYPES = [
  {
    code: "vent_naturelle_ouvertures",
    label_fr: "Ventilation naturelle par ouvertures (fenêtres, grilles façade)",
    synonyms: ["ventilation naturelle", "ouverture fenêtres", "aération naturelle"],
    typical_lifespan_years: 0,
    common_pathologies: ["debit_insuffisant", "non_respect_arrete_1982", "humidite_excessive"],
  },
  {
    code: "vent_naturelle_conduits",
    label_fr: "Ventilation naturelle par conduits (gaines shunt, tirage thermique)",
    synonyms: ["conduits shunt", "ventilation par tirage", "VN conduits", "gaines ventilation"],
    typical_lifespan_years: 80,
    common_pathologies: ["obstruction_conduit", "amiante_conduit_avant_1997", "tirage_insuffisant"],
  },
  {
    code: "vent_naturelle_hybride",
    label_fr: "Ventilation hybride (naturelle assistée mécaniquement)",
    synonyms: ["VH", "ventilation hybride", "extracteur hybride"],
    typical_lifespan_years: 20,
    common_pathologies: ["extracteur_hs", "régulation_défaillante"],
  },
  {
    code: "vent_vmc_simple_flux_autoreglable",
    label_fr: "VMC simple flux autoréglable",
    synonyms: ["VMC SF auto", "VMC autoréglable"],
    typical_lifespan_years: 20,
    common_pathologies: ["caisson_extraction_hs", "bouches_encrassees", "absence_entrees_air", "defaut_equilibrage"],
  },
  {
    code: "vent_vmc_simple_flux_hygro_a",
    label_fr: "VMC simple flux hygroréglable type A (bouches hygro)",
    synonyms: ["VMC hygro A", "VMC hygroréglable A"],
    typical_lifespan_years: 20,
    common_pathologies: ["bouches_hygro_hs", "caisson_extraction_hs", "encrassement"],
  },
  {
    code: "vent_vmc_simple_flux_hygro_b",
    label_fr: "VMC simple flux hygroréglable type B (bouches + entrées d'air hygro)",
    synonyms: ["VMC hygro B", "VMC hygroréglable B"],
    typical_lifespan_years: 20,
    common_pathologies: ["bouches_hygro_hs", "caisson_extraction_hs", "encrassement"],
  },
  {
    code: "vent_vmc_double_flux_avec_echangeur",
    label_fr: "VMC double flux avec échangeur de chaleur (MVHR)",
    synonyms: ["VMC DF", "double flux", "MVHR", "VMC avec récupération chaleur"],
    typical_lifespan_years: 25,
    common_pathologies: ["filtres_encrassés", "échangeur_encrassé", "ventilateur_hs", "réseau_gaines_dégradé"],
  },
  {
    code: "vent_vmc_double_flux_sans_echangeur",
    label_fr: "VMC double flux sans échangeur (rare)",
    synonyms: ["DF sans récupération"],
    typical_lifespan_years: 25,
    common_pathologies: ["filtres_encrassés", "ventilateur_hs"],
  },
  {
    code: "vent_mecanique_insufflation",
    label_fr: "Ventilation mécanique par insufflation",
    synonyms: ["VMI", "insufflation"],
    typical_lifespan_years: 20,
    common_pathologies: ["filtre_encrassé", "ventilateur_hs"],
  },
] as const;

export type VentilationCode = typeof VENTILATION_TYPES[number]["code"];

// =============================================================================
// 8. SYSTÈMES TECHNIQUES — PLOMBERIE
// =============================================================================

export const PLOMBERIE_TYPES = [
  {
    code: "plb_colonne_eau_froide_acier_galvanise",
    label_fr: "Colonne montante eau froide — acier galvanisé",
    synonyms: ["colonne EF acier galva", "acier galvanisé", "tube galva"],
    typical_lifespan_years: 40, // Source : PLB-01, durée 30-40 ans
    common_pathologies: ["corrosion_acier_galvanise", "eau_rougeatre", "depots_calcaires", "fuites_piquages"],
  },
  {
    code: "plb_colonne_eau_froide_cuivre",
    label_fr: "Colonne montante eau froide — cuivre",
    synonyms: ["colonne EF cuivre", "tube cuivre"],
    typical_lifespan_years: 60,
    common_pathologies: ["corrosion_électrochimique", "fuite_piquage", "calorifuge_absent"],
  },
  {
    code: "plb_colonne_eau_froide_per_multicouche",
    label_fr: "Colonne montante eau froide — PER ou multicouche",
    synonyms: ["PER", "multicouche", "tube synthétique"],
    typical_lifespan_years: 50,
    common_pathologies: ["défaut_raccord_serti", "exposition_uv"],
  },
  {
    code: "plb_colonne_plomb",
    label_fr: "Canalisation plomb (eau potable, immeubles avant 1950)",
    synonyms: ["canalisation plomb", "tube plomb", "AEP plomb"],
    typical_lifespan_years: 80,
    common_pathologies: ["teneur_plomb_eau_superieure_10ug", "obligation_remplacement", "corrosion"],
  },
  {
    code: "plb_colonne_evacuation_fonte",
    label_fr: "Colonne d'évacuation EU/EV — fonte",
    synonyms: ["chute fonte", "EU fonte", "évacuation fonte"],
    typical_lifespan_years: 60,
    common_pathologies: ["corrosion_fonte", "fuite_joint_chanvre_plomb", "obstruction_calcaire"],
  },
  {
    code: "plb_colonne_evacuation_pvc",
    label_fr: "Colonne d'évacuation EU/EV — PVC",
    synonyms: ["chute PVC", "EU PVC", "évacuation PVC"],
    typical_lifespan_years: 40,
    common_pathologies: ["déboitement_joint", "fragilisation_uv", "vibration_acoustique"],
  },
  {
    code: "plb_colonne_evacuation_grès",
    label_fr: "Colonne d'évacuation EU/EV — grès vernissé (très ancien)",
    synonyms: ["chute grès", "grès vernissé"],
    typical_lifespan_years: 80,
    common_pathologies: ["fissuration_grès", "joint_dégradé"],
  },
  {
    code: "plb_descente_ep_zinc",
    label_fr: "Descente d'eaux pluviales — zinc",
    synonyms: ["descente EP zinc", "tuyau de descente"],
    typical_lifespan_years: 40,
    common_pathologies: ["corrosion_zinc", "déboitement", "bouchage_feuilles"],
  },
  {
    code: "plb_descente_ep_pvc",
    label_fr: "Descente d'eaux pluviales — PVC",
    synonyms: ["descente EP PVC"],
    typical_lifespan_years: 30,
    common_pathologies: ["fragilisation_uv", "bouchage_feuilles", "déboitement"],
  },
  {
    code: "plb_collecteur_general_horizontal",
    label_fr: "Collecteur général horizontal sous-sol (vers raccordement réseau public)",
    synonyms: ["collecteur sous-sol", "branchement public", "regard"],
    typical_lifespan_years: 60,
    common_pathologies: ["fissure_collecteur", "infiltration_racines", "pente_insuffisante"],
  },
  {
    code: "plb_disconnecteur_anti_retour",
    label_fr: "Disconnecteur anti-retour (alimentation eau potable)",
    synonyms: ["disconnecteur BA", "clapet anti-retour", "protection réseau public"],
    typical_lifespan_years: 15,
    common_pathologies: ["défaillance_clapet", "absence_disconnecteur"],
  },
] as const;

export type PlomberieCode = typeof PLOMBERIE_TYPES[number]["code"];

// =============================================================================
// 9. SYSTÈMES TECHNIQUES — ÉLECTRICITÉ PARTIES COMMUNES
// =============================================================================

export const ELECTRICITE_TYPES = [
  {
    code: "elec_tgbt_parties_communes",
    label_fr: "Tableau général basse tension (TGBT) parties communes",
    synonyms: ["TGBT", "armoire électrique", "tableau parties communes"],
    typical_lifespan_years: 30,
    common_pathologies: ["non_conformite_NF_C_15_100", "absence_30mA", "surchauffe_borniers", "vétusté_disjoncteurs"],
  },
  {
    code: "elec_colonne_montante_concessionnaire",
    label_fr: "Colonnes montantes électriques (Enedis ou copropriété)",
    synonyms: ["colonne montante", "réseau concessionnaire", "Enedis"],
    typical_lifespan_years: 50,
    common_pathologies: ["vétusté_câbles", "non_conformite", "transfert_propriete_enedis"],
  },
  {
    code: "elec_eclairage_parties_communes_traditionnel",
    label_fr: "Éclairage parties communes — luminaires traditionnels (incandescent, halogène, fluo)",
    synonyms: ["éclairage hall", "minuterie", "tubes fluo"],
    typical_lifespan_years: 20,
    common_pathologies: ["consommation_excessive", "vétusté_minuterie", "absence_detecteur_presence"],
  },
  {
    code: "elec_eclairage_parties_communes_led",
    label_fr: "Éclairage parties communes — LED + détection de présence",
    synonyms: ["éclairage LED", "luminaires LED", "détecteur présence"],
    typical_lifespan_years: 20,
    common_pathologies: ["défaillance_detecteur", "vétusté_driver_led"],
  },
  {
    code: "elec_parafoudre_type_2",
    label_fr: "Parafoudre type 2 (protection surtensions atmosphériques)",
    synonyms: ["parafoudre", "protection foudre", "SPD type 2"],
    typical_lifespan_years: 15,
    common_pathologies: ["défaillance_apres_choc", "absence_parafoudre"],
  },
  {
    code: "elec_paratonnerre_immeuble_haut",
    label_fr: "Paratonnerre (bâtiments > 28 m ou exposés)",
    synonyms: ["paratonnerre", "PDA", "pointe captrice"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_descente", "défaut_prise_terre"],
  },
] as const;

export type ElectriciteCode = typeof ELECTRICITE_TYPES[number]["code"];

// =============================================================================
// 10. SYSTÈMES TECHNIQUES — ASCENSEURS
// =============================================================================

export const ASCENSEUR_TYPES = [
  {
    code: "asc_traction_machinerie_haute",
    label_fr: "Ascenseur à traction — machinerie en local technique haut",
    synonyms: ["ascenseur traction", "machinerie haute", "câble traction"],
    typical_lifespan_years: 40,
    common_pathologies: ["non_conformite_EN81_20_50", "vétusté_câbles", "vétusté_armoire_de_manoeuvre", "portes_palieres_non_conformes"],
  },
  {
    code: "asc_traction_machinerie_embarquee",
    label_fr: "Ascenseur à traction — machinerie embarquée (Gearless)",
    synonyms: ["MRL", "machine roomless", "Gearless", "ascenseur sans local"],
    typical_lifespan_years: 30,
    common_pathologies: ["vétusté_moteur_gearless", "régulation_dégradée"],
  },
  {
    code: "asc_hydraulique",
    label_fr: "Ascenseur hydraulique (vérin)",
    synonyms: ["ascenseur hydraulique", "vérin hydraulique"],
    typical_lifespan_years: 30,
    common_pathologies: ["fuite_huile_verin", "obligation_double_paroi_cuve", "vétusté_groupe"],
  },
  {
    code: "asc_monte_charge",
    label_fr: "Monte-charge (parking, poubelle)",
    synonyms: ["monte-charge", "élévateur"],
    typical_lifespan_years: 30,
    common_pathologies: ["vétusté_motorisation", "non_conformite_securite"],
  },
] as const;

export type AscenseurCode = typeof ASCENSEUR_TYPES[number]["code"];

// =============================================================================
// 11. SYSTÈMES TECHNIQUES — SÉCURITÉ INCENDIE
// =============================================================================

export const SECURITE_INCENDIE_TYPES = [
  {
    code: "sec_inc_extincteurs",
    label_fr: "Extincteurs (parties communes, parking)",
    synonyms: ["extincteur", "RIA", "moyen de secours"],
    typical_lifespan_years: 20,
    common_pathologies: ["vetuste_pression", "absence_verification_annuelle"],
  },
  {
    code: "sec_inc_baes_blocs_secours",
    label_fr: "BAES — blocs autonomes d'éclairage de sécurité",
    synonyms: ["BAES", "éclairage de secours", "bloc secours"],
    typical_lifespan_years: 10,
    common_pathologies: ["batterie_dechargee", "vétusté_lampes", "absence_test_periodique"],
  },
  {
    code: "sec_inc_colonnes_seches",
    label_fr: "Colonnes sèches (immeubles > 28 m)",
    synonyms: ["colonne sèche", "colonne pompiers"],
    typical_lifespan_years: 50,
    common_pathologies: ["corrosion_colonne", "raccord_pompier_dégradé", "absence_essai_pression"],
  },
  {
    code: "sec_inc_desenfumage_escalier",
    label_fr: "Désenfumage de cage d'escalier (DENFC, exutoire)",
    synonyms: ["désenfumage", "DENFC", "exutoire de fumée", "trappe de désenfumage"],
    typical_lifespan_years: 30,
    common_pathologies: ["motorisation_hs", "câble_dégradé", "absence_essai"],
  },
  {
    code: "sec_inc_compartimentage_portes_cf",
    label_fr: "Compartimentage — portes coupe-feu, ferme-portes",
    synonyms: ["porte CF", "porte coupe-feu", "ferme-porte", "compartimentage"],
    typical_lifespan_years: 30,
    common_pathologies: ["ferme_porte_hs", "joint_intumescent_dégradé", "non_conformite_CF"],
  },
  {
    code: "sec_inc_ssi_categorie",
    label_fr: "SSI — Système de Sécurité Incendie (catégorie A à E selon ERP)",
    synonyms: ["SSI", "système sécurité incendie", "centrale incendie"],
    typical_lifespan_years: 15,
    common_pathologies: ["vétusté_centrale", "non_conformite_NF_S_61", "défaut_alimentation_secours"],
  },
  {
    code: "sec_inc_detecteurs_fumee_parties_communes",
    label_fr: "Détecteurs autonomes de fumée (parties communes)",
    synonyms: ["DAAF parties communes", "détecteur fumée"],
    typical_lifespan_years: 10,
    common_pathologies: ["pile_dechargee", "encrassement"],
  },
] as const;

export type SecuriteIncendieCode = typeof SECURITE_INCENDIE_TYPES[number]["code"];

// =============================================================================
// 12. SYSTÈMES TECHNIQUES — INTERPHONIE / CONTRÔLE D'ACCÈS
// =============================================================================

export const CONTROLE_ACCES_TYPES = [
  {
    code: "acces_interphone_audio",
    label_fr: "Interphone audio (parlophone simple)",
    synonyms: ["interphone audio", "parlophone", "audiophone"],
    typical_lifespan_years: 20,
    common_pathologies: ["vétusté_combiné", "défaut_câblage", "non_conformite_TIC"],
  },
  {
    code: "acces_visiophone",
    label_fr: "Visiophone (interphone vidéo)",
    synonyms: ["visiophone", "vidéophone", "interphone vidéo"],
    typical_lifespan_years: 15,
    common_pathologies: ["caméra_hs", "écran_hs"],
  },
  {
    code: "acces_digicode",
    label_fr: "Digicode / clavier à code",
    synonyms: ["digicode", "clavier code", "code accès"],
    typical_lifespan_years: 15,
    common_pathologies: ["clavier_hs", "vandalisme"],
  },
  {
    code: "acces_vigik_badge",
    label_fr: "Système Vigik (badges, professionnels du courrier)",
    synonyms: ["Vigik", "badge Vigik", "lecteur Vigik"],
    typical_lifespan_years: 15,
    common_pathologies: ["lecteur_hs", "obsolescence_protocole"],
  },
  {
    code: "acces_badge_proximite",
    label_fr: "Lecteur de badge de proximité (Mifare, RFID)",
    synonyms: ["badge proximité", "RFID", "Mifare"],
    typical_lifespan_years: 15,
    common_pathologies: ["lecteur_hs", "perte_badges"],
  },
] as const;

export type ControleAccesCode = typeof CONTROLE_ACCES_TYPES[number]["code"];

// =============================================================================
// 13. PARTIES COMMUNES INTÉRIEURES
// =============================================================================

export const PARTIES_COMMUNES_TYPES = [
  {
    code: "pc_hall_entree",
    label_fr: "Hall d'entrée d'immeuble",
    synonyms: ["hall", "entrée immeuble", "vestibule"],
    typical_lifespan_years: 20,
    common_pathologies: ["revêtement_dégradé", "peinture_ecaillee", "luminaire_vétuste"],
  },
  {
    code: "pc_cage_escalier",
    label_fr: "Cage d'escalier (parties communes verticales)",
    synonyms: ["cage escalier", "escalier", "trémie"],
    typical_lifespan_years: 50,
    common_pathologies: ["peinture_ecaillee", "marches_dégradées", "rampe_dégradée"],
  },
  {
    code: "pc_palier_distribution",
    label_fr: "Paliers de distribution (devant portes palières)",
    synonyms: ["palier", "distribution étage"],
    typical_lifespan_years: 30,
    common_pathologies: ["revêtement_sol_dégradé", "peinture_ecaillee"],
  },
  {
    code: "pc_sol_carrelage",
    label_fr: "Sol parties communes — carrelage",
    synonyms: ["carrelage hall", "carrelage palier", "grès cérame"],
    typical_lifespan_years: 50,
    common_pathologies: ["carreau_fendu", "joint_dégradé", "décollement"],
  },
  {
    code: "pc_sol_pierre_marbre",
    label_fr: "Sol parties communes — pierre / marbre",
    synonyms: ["marbre", "pierre naturelle", "granit"],
    typical_lifespan_years: 100,
    common_pathologies: ["usure_polissage", "tâches_calcaire"],
  },
  {
    code: "pc_sol_souple_pvc_lino",
    label_fr: "Sol parties communes — revêtement souple (PVC, linoléum)",
    synonyms: ["PVC sol", "linoléum", "lino", "revêtement plastique"],
    typical_lifespan_years: 15,
    common_pathologies: ["usure", "decollement", "joint_dégradé"],
  },
  {
    code: "pc_mur_peinture",
    label_fr: "Murs parties communes — peinture",
    synonyms: ["peinture murale", "peinture acrylique", "peinture glycéro"],
    typical_lifespan_years: 10,
    common_pathologies: ["ecaillage", "tâches", "salissures"],
  },
  {
    code: "pc_mur_revetement_textile_papier",
    label_fr: "Murs parties communes — revêtement papier ou textile",
    synonyms: ["papier peint", "tissu mural", "revêtement textile"],
    typical_lifespan_years: 15,
    common_pathologies: ["décollement", "salissures"],
  },
  {
    code: "pc_local_velo",
    label_fr: "Local vélos / poussettes",
    synonyms: ["local vélos", "local poussettes", "garage à vélos"],
    typical_lifespan_years: 30,
    common_pathologies: ["étanchéité_dégradée", "porte_dégradée"],
  },
  {
    code: "pc_local_dechets",
    label_fr: "Local poubelles / tri sélectif",
    synonyms: ["local poubelles", "local OM", "local tri"],
    typical_lifespan_years: 30,
    common_pathologies: ["odeurs", "non_conformite_decret_propret_e"],
  },
  {
    code: "pc_caves_celliers",
    label_fr: "Caves / celliers en sous-sol",
    synonyms: ["caves", "celliers", "sous-sol"],
    typical_lifespan_years: 60,
    common_pathologies: ["humidite_sous_sol", "ventilation_insuffisante", "remontee_capillaire"],
  },
  {
    code: "pc_parking_couvert",
    label_fr: "Parking couvert / souterrain",
    synonyms: ["parking", "garage collectif", "sous-sol parking"],
    typical_lifespan_years: 60,
    common_pathologies: ["dalle_fissuree", "etancheite_dégradée", "ventilation_insuffisante", "carbonatation_dalle"],
  },
] as const;

export type PartiesCommunesCode = typeof PARTIES_COMMUNES_TYPES[number]["code"];

// =============================================================================
// 14. ÉTAT DE CONSERVATION (échelle commune transversale)
// =============================================================================

export const ETAT_CONSERVATION = [
  {
    code: "neuf",
    label_fr: "Neuf",
    description: "Élément récemment installé, sans usure visible. Pas de travaux à prévoir.",
  },
  {
    code: "bon",
    label_fr: "Bon état",
    description: "Élément en service normal, entretien courant suffisant. Pas de travaux à court terme (≥ 5 ans).",
  },
  {
    code: "moyen",
    label_fr: "État moyen",
    description: "Usure visible mais fonctionnement assuré. Travaux à planifier dans 3 à 5 ans.",
  },
  {
    code: "degrade",
    label_fr: "État dégradé",
    description: "Dégradations significatives, performances altérées. Travaux à prévoir sous 1 à 3 ans.",
  },
  {
    code: "vetuste",
    label_fr: "Vétuste",
    description: "Fin de vie technique atteinte ou dépassée. Remplacement nécessaire à court terme (≤ 1 an).",
  },
  {
    code: "hors_service",
    label_fr: "Hors service",
    description: "Élément non fonctionnel ou présentant un risque immédiat. Intervention urgente.",
  },
] as const;

export type EtatConservationCode = typeof ETAT_CONSERVATION[number]["code"];

// =============================================================================
// 15. PATHOLOGIES TYPIQUES — TRANSVERSALES
// =============================================================================
// Codes alignés sur les chunks 09_tech_* (STR/ENV/HUM/BIO/HAZ/PLB/ELC/CVC)

export const PATHOLOGIES = [
  // --- HUMIDITÉ ---
  {
    code: "humidite_remontee_capillaire",
    label_fr: "Remontée capillaire (humidité ascensionnelle)",
    synonyms: ["remontée capillaire", "humidité ascensionnelle", "salpêtre bas de mur", "capillarité"],
    famille: "humidite",
    gravite: "moyenne",
    code_source: "HUM-01",
  },
  {
    code: "humidite_infiltration_facade",
    label_fr: "Infiltration en façade",
    synonyms: ["infiltration mur", "infiltration latérale", "défaut étanchéité façade"],
    famille: "humidite",
    gravite: "moyenne",
    code_source: "HUM-03",
  },
  {
    code: "humidite_condensation_superficielle",
    label_fr: "Condensation superficielle (sur paroi froide)",
    synonyms: ["condensation murale", "buée parois", "moisissures angles"],
    famille: "humidite",
    gravite: "faible_moyenne",
    code_source: "HUM-04",
  },
  {
    code: "humidite_condensation_interstitielle",
    label_fr: "Condensation interstitielle (dans la paroi)",
    synonyms: ["condensation paroi", "Glaser", "humidité cachée"],
    famille: "humidite",
    gravite: "moyenne",
    code_source: "HUM-05",
  },
  {
    code: "humidite_sous_sol",
    label_fr: "Humidité du sous-sol / cave",
    synonyms: ["humidité cave", "sous-sol humide", "infiltration enterrée"],
    famille: "humidite",
    gravite: "moyenne",
    code_source: "HUM-06",
  },
  // --- FISSURATION ---
  {
    code: "fissure_capillaire_superficielle",
    label_fr: "Fissure capillaire (< 0,2 mm, retrait d'enduit)",
    synonyms: ["microfissure", "faïençage", "fissure esthétique"],
    famille: "fissuration",
    gravite: "faible",
    code_source: "ENV-F01",
  },
  {
    code: "fissure_superficielle_enduit",
    label_fr: "Fissure superficielle d'enduit (0,2 à 1 mm)",
    synonyms: ["fissure enduit", "fissure non traversante"],
    famille: "fissuration",
    gravite: "faible_moyenne",
    code_source: "ENV-F01",
  },
  {
    code: "fissure_traversante",
    label_fr: "Fissure traversante (> 1 mm, enduit + support)",
    synonyms: ["fissure traversante", "fissure visible deux côtés"],
    famille: "fissuration",
    gravite: "moyenne_haute",
    code_source: "ENV-F01 / STR-01",
  },
  {
    code: "fissure_structurelle_active",
    label_fr: "Fissure structurelle active (évolutive, témoin rompu)",
    synonyms: ["fissure active", "fissure évolutive", "fissure RGA"],
    famille: "fissuration",
    gravite: "critique",
    code_source: "STR-01",
  },
  {
    code: "fissure_rga_retrait_argile",
    label_fr: "Fissure liée au retrait-gonflement des argiles (RGA)",
    synonyms: ["RGA", "retrait gonflement argile", "sécheresse"],
    famille: "fissuration",
    gravite: "critique",
    code_source: "STR-02",
  },
  {
    code: "tassement_differentiel",
    label_fr: "Tassement différentiel des fondations",
    synonyms: ["tassement", "affaissement fondation"],
    famille: "fissuration",
    gravite: "critique",
    code_source: "STR-03",
  },
  // --- CORROSION ---
  {
    code: "corrosion_armatures_beton",
    label_fr: "Corrosion des armatures béton armé (carbonatation, chlorures)",
    synonyms: ["corrosion ferraille", "carbonatation", "éclatement béton"],
    famille: "corrosion",
    gravite: "moyenne_haute",
    code_source: "ENV-F05",
  },
  {
    code: "corrosion_metallerie",
    label_fr: "Corrosion de métallerie (garde-corps, charpente, zinguerie)",
    synonyms: ["rouille", "oxydation acier"],
    famille: "corrosion",
    gravite: "moyenne",
    code_source: "ENV-T03 / ENV-T04",
  },
  {
    code: "corrosion_canalisation_acier",
    label_fr: "Corrosion canalisations acier galvanisé",
    synonyms: ["corrosion plomberie", "rouille tuyaux"],
    famille: "corrosion",
    gravite: "moyenne",
    code_source: "PLB-01",
  },
  // --- BIOLOGIE ---
  {
    code: "moisissures_surface",
    label_fr: "Moisissures de surface (HR > 70%)",
    synonyms: ["moisissures", "champignons noirs", "Aspergillus", "Cladosporium"],
    famille: "biologie",
    gravite: "faible_moyenne",
    code_source: "BIO-01",
  },
  {
    code: "merule_pourriture_cubique",
    label_fr: "Mérule (Serpula lacrymans, pourriture cubique)",
    synonyms: ["mérule", "pourriture cubique", "Serpula"],
    famille: "biologie",
    gravite: "critique",
    code_source: "BIO-02",
  },
  {
    code: "xylophages_vrillette_capricorne",
    label_fr: "Insectes xylophages (vrillette, capricorne)",
    synonyms: ["vrillette", "capricorne", "petite vrillette", "grosse vrillette"],
    famille: "biologie",
    gravite: "moyenne_haute",
    code_source: "BIO-03",
  },
  {
    code: "termites_galeries_souterraines",
    label_fr: "Termites (Reticulitermes — galeries souterraines)",
    synonyms: ["termites", "Reticulitermes"],
    famille: "biologie",
    gravite: "haute",
    code_source: "BIO-03 / HAZ-03",
  },
  // --- MATÉRIAUX DANGEREUX ---
  {
    code: "amiante_suspect_avant_1997",
    label_fr: "Présence d'amiante suspectée (PC avant 01/07/1997)",
    synonyms: ["amiante", "fibrociment amianté", "flocage", "calorifuge amianté"],
    famille: "materiaux_dangereux",
    gravite: "critique",
    code_source: "HAZ-01",
  },
  {
    code: "plomb_peinture_avant_1949",
    label_fr: "Peinture au plomb suspectée (bâtiment avant 1949)",
    synonyms: ["plomb peinture", "céruse", "minium plomb"],
    famille: "materiaux_dangereux",
    gravite: "haute",
    code_source: "HAZ-02",
  },
  {
    code: "plomb_canalisation_eau_potable",
    label_fr: "Canalisation plomb sur réseau eau potable",
    synonyms: ["tuyau plomb", "AEP plomb"],
    famille: "materiaux_dangereux",
    gravite: "haute",
    code_source: "HAZ-02 / PLB-04",
  },
  {
    code: "radon_zone_potentiel",
    label_fr: "Radon — zone à potentiel radon (granitique)",
    synonyms: ["radon", "gaz radon"],
    famille: "materiaux_dangereux",
    gravite: "moyenne",
    code_source: "HAZ-04",
  },
  // --- TOITURE / ÉTANCHÉITÉ ---
  {
    code: "infiltration_toiture",
    label_fr: "Infiltration en toiture (tuiles, faîtage, noue)",
    synonyms: ["infiltration toit", "fuite toiture"],
    famille: "etancheite",
    gravite: "moyenne_haute",
    code_source: "ENV-T01",
  },
  {
    code: "cloquage_etancheite_terrasse",
    label_fr: "Cloquage de l'étanchéité de toiture-terrasse",
    synonyms: ["cloque bitume", "boursouflure étanchéité"],
    famille: "etancheite",
    gravite: "moyenne_haute",
    code_source: "ENV-T02",
  },
  {
    code: "decollement_releve_etancheite",
    label_fr: "Décollement du relevé d'étanchéité (acrotère, souche)",
    synonyms: ["relevé étanchéité décollé", "défaut acrotère"],
    famille: "etancheite",
    gravite: "moyenne_haute",
    code_source: "ENV-T02",
  },
  // --- VÉTUSTÉ ---
  {
    code: "vetuste_generalisee",
    label_fr: "Vétusté généralisée d'un poste (fin de vie technique)",
    synonyms: ["vétusté", "fin de vie", "obsolescence"],
    famille: "vetuste",
    gravite: "moyenne_haute",
    code_source: "transversal",
  },
  {
    code: "vetuste_localisee",
    label_fr: "Vétusté localisée (élément spécifique en fin de vie)",
    synonyms: ["vétusté ponctuelle", "défaillance localisée"],
    famille: "vetuste",
    gravite: "moyenne",
    code_source: "transversal",
  },
  // --- NON-CONFORMITÉ RÉGLEMENTAIRE ---
  {
    code: "non_conformite_NF_C_15_100",
    label_fr: "Non-conformité électrique NF C 15-100 (parties communes)",
    synonyms: ["non conforme NFC 15-100", "absence 30mA", "tableau vétuste"],
    famille: "non_conformite",
    gravite: "critique",
    code_source: "ELC-01",
  },
  {
    code: "non_conformite_ascenseur_EN81",
    label_fr: "Non-conformité ascenseur (loi SAE / EN 81-20/50)",
    synonyms: ["non conforme ascenseur", "loi SAE", "loi de 2003 ascenseur"],
    famille: "non_conformite",
    gravite: "haute",
    code_source: "transversal",
  },
  {
    code: "non_conformite_garde_corps_hauteur",
    label_fr: "Garde-corps non conforme (hauteur < 1 m ou remplissage non conforme)",
    synonyms: ["GC non conforme", "rambarde basse"],
    famille: "non_conformite",
    gravite: "haute",
    code_source: "transversal",
  },
  {
    code: "non_conformite_debit_ventilation_arrete_1982",
    label_fr: "Débits de ventilation non conformes (arrêté 24/03/1982)",
    synonyms: ["VMC non conforme", "débits insuffisants"],
    famille: "non_conformite",
    gravite: "moyenne",
    code_source: "CVC-01",
  },
] as const;

export type PathologieCode = typeof PATHOLOGIES[number]["code"];

// =============================================================================
// EXPORT AGRÉGÉ — PPPT_NOMENCLATURE
// =============================================================================

export const PPPT_NOMENCLATURE = {
  TOITURE_TYPES,
  FACADE_TYPES,
  MENUISERIE_TYPES,
  STRUCTURE_TYPES,
  FONDATION_TYPES,
  CHAUFFAGE_COLLECTIF_TYPES,
  ECS_COLLECTIVE_TYPES,
  VENTILATION_TYPES,
  PLOMBERIE_TYPES,
  ELECTRICITE_TYPES,
  ASCENSEUR_TYPES,
  SECURITE_INCENDIE_TYPES,
  CONTROLE_ACCES_TYPES,
  PARTIES_COMMUNES_TYPES,
  ETAT_CONSERVATION,
  PATHOLOGIES,
} as const;

export type PpptNomenclatureKey = keyof typeof PPPT_NOMENCLATURE;
