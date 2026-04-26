/**
 * VTU — Nomenclature canonique DTG (méthode Energyco)
 * ==========================================================
 *
 * Source primaire : Project Knowledge Energyco — base RAG copropriété
 *   - 05a_dtg_definition_obligations.md  (CCH L.731-1 à L.731-5)
 *   - 05a_dtg_contenu_4_volets.md         (4 volets réglementaires)
 *   - 05a_dtg_rapport_type.md             (structure rapport, fiches de poste)
 *   - 05a_dtg_maprimerenov_couts_lois.md  (coûts indicatifs)
 *   - 01_JURIDIQUE_lois_decrets.md        (lois ALUR, ELAN, Climat-Résilience)
 *   - 06b_AIDES_eco_ptz_hub.md            (fourchettes prix travaux 2025-2026)
 *
 * Périmètre : DTG (CCH art. L.731-1) — plus large que PPPT.
 *   - Volet 1 : analyse parties communes (tout le PPPT)
 *   - Volet 2 : situation réglementaire
 *   - Volet 3 : gestion technique et patrimoniale (financière + juridique)
 *   - Volet 4 : DPE collectif (intégré)
 *
 * Doctrine VTU : liste fermée. Si Gemini ne match aucun code → custom_field.
 *
 * Date : 2026-04-26
 * Auteur : Energyco (Omar) + assistant RAG
 */

import { PPPT_NOMENCLATURE } from "./pppt_systemes";

// =============================================================================
// 1. SITUATION DU SYNDICAT
// =============================================================================

export const SYNDICAT_TYPES = [
  {
    code: "syndic_professionnel",
    label_fr: "Syndic professionnel (carte G, agent immobilier)",
    synonyms: ["syndic pro", "administrateur de biens", "syndic carte G"],
    description: "Syndic titulaire d'une carte professionnelle de gestion immobilière (loi Hoguet).",
  },
  {
    code: "syndic_benevole",
    label_fr: "Syndic bénévole (copropriétaire élu)",
    synonyms: ["syndic bénévole", "syndic non professionnel", "syndic copropriétaire"],
    description: "Copropriétaire élu en AG sans rémunération professionnelle.",
  },
  {
    code: "syndic_cooperatif",
    label_fr: "Syndic coopératif (conseil syndical assurant la fonction)",
    synonyms: ["syndic coop", "coopérative syndicale"],
    description: "Le conseil syndical élit en son sein un président qui exerce la fonction de syndic.",
  },
  {
    code: "syndic_provisoire_judiciaire",
    label_fr: "Administrateur provisoire (mandat judiciaire)",
    synonyms: ["administrateur provisoire", "AP", "syndic judiciaire"],
    description: "Désigné par le tribunal en cas de carence de syndic ou de copropriété en difficulté (art. 29-1 loi 1965).",
  },
] as const;

export type SyndicatCode = typeof SYNDICAT_TYPES[number]["code"];

export const REGIME_JURIDIQUE_TYPES = [
  {
    code: "regime_loi_1965_classique",
    label_fr: "Copropriété loi du 10 juillet 1965 (régime classique)",
    synonyms: ["loi 1965", "copropriété classique", "copro verticale"],
    description: "Régime de droit commun de la copropriété des immeubles bâtis.",
  },
  {
    code: "regime_copropriete_horizontale",
    label_fr: "Copropriété horizontale (maisons individuelles avec terrain commun)",
    synonyms: ["copropriété horizontale", "lotissement copro", "village copropriété"],
    description: "Copropriété de maisons individuelles avec parties communes (voiries, espaces verts, équipements).",
  },
  {
    code: "regime_asl_libre",
    label_fr: "Association Syndicale Libre (ASL)",
    synonyms: ["ASL", "association syndicale libre"],
    description: "Groupement de propriétaires fonciers (lotissements, ZAC) — régime ordonnance 2004-632.",
  },
  {
    code: "regime_aful",
    label_fr: "Association Foncière Urbaine Libre (AFUL)",
    synonyms: ["AFUL", "association foncière urbaine"],
    description: "Variante d'ASL en milieu urbain (remembrement, restauration immobilière).",
  },
  {
    code: "regime_volumes_division_volume",
    label_fr: "Division en volumes (état descriptif de division en volumes)",
    synonyms: ["division en volumes", "EDDV", "DV"],
    description: "Mode juridique alternatif à la copropriété — usage en grands ensembles tertiaires/mixtes complexes.",
  },
  {
    code: "regime_copropriete_imbriquee",
    label_fr: "Copropriétés imbriquées / syndicats secondaires",
    synonyms: ["copropriété imbriquée", "syndicat secondaire", "art 27 loi 1965"],
    description: "Syndicat principal + syndicats secondaires (bâtiments) — art. 27 loi 1965.",
  },
] as const;

export type RegimeJuridiqueCode = typeof REGIME_JURIDIQUE_TYPES[number]["code"];

// =============================================================================
// 2. OBLIGATIONS RÉGLEMENTAIRES À TRACKER (situation administrative DTG vol. 2)
// =============================================================================

export const OBLIGATION_REGLEMENTAIRE_TYPES = [
  {
    code: "obl_immatriculation_rnic",
    label_fr: "Immatriculation au Registre National des Copropriétés (RNIC)",
    synonyms: ["RNIC", "immatriculation copro"],
    seuil_applicabilite: "Toutes copropriétés (CCH L. 711-1 à L. 711-7)",
    statut_possible: ["a_jour", "non_a_jour", "absent"],
  },
  {
    code: "obl_carnet_entretien",
    label_fr: "Carnet d'entretien de l'immeuble",
    synonyms: ["carnet entretien", "registre entretien"],
    seuil_applicabilite: "Toutes copropriétés (loi SRU 2000)",
    statut_possible: ["a_jour", "non_a_jour", "absent"],
  },
  {
    code: "obl_dpe_collectif",
    label_fr: "DPE collectif obligatoire",
    synonyms: ["DPE collectif", "DPE immeuble"],
    seuil_applicabilite: "PC avant 01/01/2013 — calendrier : >200 lots 01/01/2024, 51-200 lots 01/01/2025, ≤50 lots 01/01/2026",
    statut_possible: ["realise", "non_realise", "non_concerne", "en_cours"],
  },
  {
    code: "obl_audit_energetique",
    label_fr: "Audit énergétique réglementaire (DPE F/G)",
    synonyms: ["audit énergétique", "audit réglementaire"],
    seuil_applicabilite: "Si DPE collectif F ou G (loi Climat & Résilience)",
    statut_possible: ["realise", "non_realise", "non_concerne"],
  },
  {
    code: "obl_pppt",
    label_fr: "Projet de Plan Pluriannuel de Travaux (PPPT)",
    synonyms: ["PPPT", "PPT projet"],
    seuil_applicabilite: "Immeuble habitation ≥ 15 ans — calendrier : >200 lots 01/01/2023, 51-200 lots 01/01/2024, ≤50 lots 01/01/2025",
    statut_possible: ["realise", "non_realise", "non_concerne", "exempte_par_DTG"],
  },
  {
    code: "obl_fonds_travaux_alur",
    label_fr: "Fonds de travaux ALUR (réformé loi Climat)",
    synonyms: ["fonds travaux", "fonds ALUR", "cotisation fonds travaux"],
    seuil_applicabilite: "Immeubles habitation ≥ 10 ans depuis réception (suppression dispenses)",
    statut_possible: ["constitue_conforme", "constitue_insuffisant", "absent"],
  },
  {
    code: "obl_individualisation_frais_chauffage",
    label_fr: "Individualisation des frais de chauffage (IFC)",
    synonyms: ["IFC", "individualisation chauffage", "répartiteurs"],
    seuil_applicabilite: "Immeubles à chauffage collectif (selon seuils consommation)",
    statut_possible: ["conforme", "non_conforme", "exempte_demonstrable"],
  },
  {
    code: "obl_carnet_information_logement_cil",
    label_fr: "Carnet d'Information du Logement (CIL)",
    synonyms: ["CIL", "carnet information logement"],
    seuil_applicabilite: "Logements neufs (PC ≥ 01/01/2023) ou rénovés impactant performance énergétique",
    statut_possible: ["existant", "absent", "non_concerne"],
  },
  {
    code: "obl_diagnostic_amiante_dta_dapp",
    label_fr: "Diagnostic amiante — DTA (parties communes) ou DAPP (parties privatives)",
    synonyms: ["DTA", "DAPP", "diagnostic amiante"],
    seuil_applicabilite: "PC avant 01/07/1997",
    statut_possible: ["realise_a_jour", "realise_perime", "non_realise", "non_concerne"],
  },
  {
    code: "obl_diagnostic_plomb_crep",
    label_fr: "Constat de Risque d'Exposition au Plomb (CREP)",
    synonyms: ["CREP", "diagnostic plomb"],
    seuil_applicabilite: "Bâtiments avant 01/01/1949 (à la vente / location)",
    statut_possible: ["realise_a_jour", "non_realise", "non_concerne"],
  },
  {
    code: "obl_etat_parasitaire_termites",
    label_fr: "État parasitaire termites (zones préfectorales)",
    synonyms: ["état parasitaire", "diagnostic termites"],
    seuil_applicabilite: "Zones délimitées par arrêté préfectoral (vente)",
    statut_possible: ["realise", "non_realise", "non_concerne"],
  },
  {
    code: "obl_controle_ascenseur",
    label_fr: "Contrôle technique quinquennal ascenseur (décret 2004)",
    synonyms: ["contrôle ascenseur", "vérification réglementaire ascenseur"],
    seuil_applicabilite: "Tous ascenseurs",
    statut_possible: ["a_jour", "non_a_jour", "non_applicable"],
  },
  {
    code: "obl_ramonage_chauffage_collectif",
    label_fr: "Ramonage et entretien annuel chaudière collective",
    synonyms: ["ramonage", "entretien chaudière"],
    seuil_applicabilite: "Toutes chaudières (décret 9 juin 2009)",
    statut_possible: ["a_jour", "non_a_jour"],
  },
  {
    code: "obl_ravalement_facade_municipal",
    label_fr: "Ravalement obligatoire (arrêté municipal, ex. Paris 10 ans)",
    synonyms: ["ravalement obligatoire", "obligation ravalement"],
    seuil_applicabilite: "Communes ayant adopté un arrêté de ravalement (Paris : tous les 10 ans, R132-1 CCH)",
    statut_possible: ["a_jour", "non_a_jour", "non_concerne"],
  },
  {
    code: "obl_decret_tertiaire_operat",
    label_fr: "Décret tertiaire / OPERAT (parts à usage tertiaire)",
    synonyms: ["décret tertiaire", "OPERAT", "DEET"],
    seuil_applicabilite: "Bâtiments tertiaires ≥ 1000 m² (y compris parties tertiaires en copro mixte)",
    statut_possible: ["declare_a_jour", "non_declare", "non_concerne"],
  },
] as const;

export type ObligationReglementaireCode = typeof OBLIGATION_REGLEMENTAIRE_TYPES[number]["code"];

// =============================================================================
// 3. CONTRATS D'EXPLOITATION EN VIGUEUR (DTG vol. 2 et 3)
// =============================================================================

export const CONTRAT_EXPLOITATION_TYPES = [
  {
    code: "contrat_chauffage_p1",
    label_fr: "Contrat chauffage P1 — fourniture et gestion énergie",
    synonyms: ["P1", "contrat fourniture énergie"],
    description: "L'exploitant achète l'énergie pour le compte de la copropriété.",
  },
  {
    code: "contrat_chauffage_p2",
    label_fr: "Contrat chauffage P2 — entretien et maintenance",
    synonyms: ["P2", "contrat maintenance chauffage"],
    description: "Maintenance préventive et corrective courante (minimum indispensable en copro).",
  },
  {
    code: "contrat_chauffage_p3",
    label_fr: "Contrat chauffage P3 — garantie totale, renouvellement équipements",
    synonyms: ["P3", "garantie totale", "GR"],
    description: "P2 + remplacement des équipements principaux défaillants.",
  },
  {
    code: "contrat_chauffage_p4",
    label_fr: "Contrat chauffage P4 — financement de travaux de rénovation",
    synonyms: ["P4", "financement travaux"],
    description: "Couvre le financement et la réalisation de travaux d'amélioration (rare en copro).",
  },
  {
    code: "contrat_cpe_performance_energetique",
    label_fr: "CPE — Contrat de Performance Énergétique (garantie de résultat)",
    synonyms: ["CPE", "contrat performance", "IPMVP"],
    description: "Engagement de l'exploitant sur un objectif chiffré d'économie d'énergie (méthode IPMVP).",
  },
  {
    code: "contrat_entretien_ascenseur",
    label_fr: "Contrat d'entretien ascenseur (décret 2004)",
    synonyms: ["maintenance ascenseur", "contrat ascenseur"],
    description: "Obligatoire — vérifications + maintenance préventive et corrective.",
  },
  {
    code: "contrat_entretien_vmc",
    label_fr: "Contrat d'entretien VMC",
    synonyms: ["maintenance VMC", "contrat ventilation"],
    description: "Nettoyage des conduits, contrôle moteurs, remplacement bouches.",
  },
  {
    code: "contrat_entretien_porte_garage",
    label_fr: "Contrat d'entretien porte automatique parking",
    synonyms: ["maintenance porte garage", "porte automatique"],
    description: "Maintenance préventive obligatoire (NF EN 12453).",
  },
  {
    code: "contrat_entretien_ssi_extincteurs",
    label_fr: "Contrat d'entretien SSI / extincteurs / désenfumage",
    synonyms: ["maintenance sécurité incendie", "vérification extincteurs"],
    description: "Vérification annuelle obligatoire.",
  },
  {
    code: "contrat_menage_parties_communes",
    label_fr: "Contrat de ménage / nettoyage parties communes",
    synonyms: ["ménage", "nettoyage", "société de nettoyage"],
    description: "Prestation hors gardiennage.",
  },
] as const;

export type ContratExploitationCode = typeof CONTRAT_EXPLOITATION_TYPES[number]["code"];

// =============================================================================
// 4. INDICATEURS DE GESTION TECHNIQUE ET FINANCIÈRE (DTG vol. 3)
// =============================================================================

export const INDICATEUR_FINANCIER_TYPES = [
  {
    code: "ind_taux_impaye",
    label_fr: "Taux d'impayés (compte 450 / total appels de fonds)",
    synonyms: ["taux impayés", "compte 450"],
    formule: "Taux = montant compte 450 / total appels de fonds × 100",
    seuil_critique: "8% (seuil Anah pour éligibilité aides collectives)",
    unite: "%",
  },
  {
    code: "ind_fonds_travaux_alur",
    label_fr: "Fonds de travaux ALUR provisionné",
    synonyms: ["fonds travaux", "fonds ALUR provisionné"],
    formule: "Cumul des cotisations annuelles non encore utilisées",
    seuil_critique: "≥ 2,5% travaux PPT et ≥ 5% budget si PPT adopté ; ≥ 5% sinon",
    unite: "EUR",
  },
  {
    code: "ind_proportion_proprietaires_occupants",
    label_fr: "Proportion propriétaires occupants vs bailleurs",
    synonyms: ["PO/PB ratio", "occupants vs bailleurs"],
    formule: "Nb logements occupés par propriétaires / nb total logements",
    seuil_critique: "Information patrimoniale — affecte capacité décisionnelle AG",
    unite: "%",
  },
  {
    code: "ind_charges_par_m2_an",
    label_fr: "Charges de copropriété au m² par an",
    synonyms: ["charges m²", "ratio charges"],
    formule: "Total charges annuelles / surface totale tantièmes",
    seuil_critique: "Repère France ~25 €/m²/an, Paris 40-45 €/m²/an, Paris haut standing > 60 €/m²/an",
    unite: "EUR/m²/an",
  },
  {
    code: "ind_consommation_chauffage_kwhpef_m2",
    label_fr: "Consommation chauffage Energie Primaire au m²",
    synonyms: ["consommation chauffage", "kWhEP/m²/an"],
    formule: "Énergie primaire chauffage / surface chauffée",
    seuil_critique: "Voir étiquettes DPE classes A à G",
    unite: "kWhEP/m²/an",
  },
  {
    code: "ind_etiquette_dpe_collectif",
    label_fr: "Étiquette DPE collectif (A à G)",
    synonyms: ["classe DPE", "étiquette énergie collectif"],
    formule: "Méthode 3CL ou comportementale + THCex (chauffage collectif)",
    seuil_critique: "F/G = passoire thermique → travaux obligatoires sortie minimum E",
    unite: "classe",
  },
  {
    code: "ind_etiquette_ges_collectif",
    label_fr: "Étiquette GES collectif (A à G)",
    synonyms: ["classe GES", "étiquette CO2"],
    formule: "kgCO2eq/m²/an",
    seuil_critique: "Voir DPE",
    unite: "classe",
  },
] as const;

export type IndicateurFinancierCode = typeof INDICATEUR_FINANCIER_TYPES[number]["code"];

// =============================================================================
// 5. ESTIMATION COÛTS TRAVAUX — fourchettes typiques 2025-2026 marché FR
// =============================================================================
// Source : 06b_AIDES_eco_ptz_hub.md (Hellio, BatiCopro, travaux.com, mars 2026)
// Province ; Paris = +20 à +40%.

export const ORDRE_GRANDEUR_COUTS = [
  // --- RAVALEMENT FAÇADE ---
  {
    code: "cout_ravalement_simple_m2",
    label_fr: "Ravalement simple (enduit/peinture)",
    unite: "EUR/m² HT",
    fourchette_min: 30,
    fourchette_max: 100,
    note: "Province ; Paris +20-40%. Échafaudage = 20-30% du coût total.",
  },
  {
    code: "cout_ravalement_avec_ite_m2",
    label_fr: "Ravalement + ITE (isolation thermique extérieure)",
    unite: "EUR/m² HT",
    fourchette_min: 100,
    fourchette_max: 250,
    note: "Éligible MaPrimeRénov' Copro et CEE (BAR-EN-101).",
  },
  {
    code: "cout_ravalement_pierre_taille_m2",
    label_fr: "Ravalement pierre de taille (haussmannien)",
    unite: "EUR/m² HT",
    fourchette_min: 80,
    fourchette_max: 200,
    note: "Contraintes ABF possibles.",
  },
  // --- TOITURE ---
  {
    code: "cout_etancheite_terrasse_m2",
    label_fr: "Réfection étanchéité toiture-terrasse",
    unite: "EUR/m² HT",
    fourchette_min: 40,
    fourchette_max: 100,
    note: "Membrane bitumineuse ou EPDM.",
  },
  {
    code: "cout_toiture_pente_m2",
    label_fr: "Réfection toiture en pente (tuiles ou ardoises)",
    unite: "EUR/m² HT",
    fourchette_min: 50,
    fourchette_max: 150,
    note: "Selon matériaux et pente.",
  },
  {
    code: "cout_charpente_couverture_complete_m2",
    label_fr: "Réfection complète charpente + couverture",
    unite: "EUR/m² HT",
    fourchette_min: 100,
    fourchette_max: 250,
    note: "Travaux lourds.",
  },
  {
    code: "cout_isolation_combles_perdus_m2",
    label_fr: "Isolation combles perdus (soufflage R≥7)",
    unite: "EUR/m² HT",
    fourchette_min: 20,
    fourchette_max: 50,
    note: "Très bon rapport coût/efficacité — éligible CEE BAR-EN-101.",
  },
  {
    code: "cout_zinguerie_ml",
    label_fr: "Zinguerie (gouttières, chéneaux)",
    unite: "EUR/ml HT",
    fourchette_min: 30,
    fourchette_max: 80,
    note: "Souvent négligé dans les estimations initiales.",
  },
  // --- ISOLATION ---
  {
    code: "cout_iti_m2",
    label_fr: "Isolation par l'intérieur (ITI)",
    unite: "EUR/m² HT",
    fourchette_min: 40,
    fourchette_max: 80,
    note: "R ≥ 3,7 m².K/W — perte de surface habitable.",
  },
  {
    code: "cout_isolation_planchers_bas_m2",
    label_fr: "Isolation plancher bas (sur cave / parking)",
    unite: "EUR/m² HT",
    fourchette_min: 30,
    fourchette_max: 70,
    note: "R ≥ 3 m².K/W.",
  },
  {
    code: "cout_isolation_toiture_terrasse_m2",
    label_fr: "Isolation toiture-terrasse",
    unite: "EUR/m² HT",
    fourchette_min: 50,
    fourchette_max: 120,
    note: "R ≥ 4,5 m².K/W.",
  },
  // --- MENUISERIES ---
  {
    code: "cout_fenetre_pvc_dv_unite",
    label_fr: "Fenêtre PVC double vitrage (fourni-posé)",
    unite: "EUR/fenêtre",
    fourchette_min: 300,
    fourchette_max: 800,
    note: "Standard, bon rapport qualité/prix.",
  },
  {
    code: "cout_fenetre_alu_dv_unite",
    label_fr: "Fenêtre aluminium double vitrage (fourni-posé)",
    unite: "EUR/fenêtre",
    fourchette_min: 500,
    fourchette_max: 1200,
    note: "Souvent imposé en zone ABF.",
  },
  {
    code: "cout_fenetre_bois_dv_unite",
    label_fr: "Fenêtre bois double vitrage (fourni-posé)",
    unite: "EUR/fenêtre",
    fourchette_min: 600,
    fourchette_max: 1500,
    note: "Haussmannien, secteur ABF.",
  },
  // --- ASCENSEUR ---
  {
    code: "cout_ascenseur_modernisation",
    label_fr: "Modernisation ascenseur (mise aux normes)",
    unite: "EUR HT",
    fourchette_min: 30000,
    fourchette_max: 80000,
    note: "Sécurité, portes palières, câbles.",
  },
  {
    code: "cout_ascenseur_remplacement_complet",
    label_fr: "Remplacement complet d'ascenseur",
    unite: "EUR HT",
    fourchette_min: 60000,
    fourchette_max: 150000,
    note: "Cabine + machinerie + gaine.",
  },
  {
    code: "cout_ascenseur_installation_neuve",
    label_fr: "Installation ascenseur neuf (immeuble sans ascenseur)",
    unite: "EUR HT",
    fourchette_min: 80000,
    fourchette_max: 200000,
    note: "Rare, accord unanime requis.",
  },
  {
    code: "cout_ascenseur_entretien_annuel",
    label_fr: "Contrat d'entretien ascenseur",
    unite: "EUR HT/an",
    fourchette_min: 3000,
    fourchette_max: 8000,
    note: "Obligatoire (décret 2004).",
  },
  // --- CHAUFFAGE COLLECTIF ---
  {
    code: "cout_chaudiere_gaz_condensation_collective",
    label_fr: "Remplacement chaudière gaz à condensation collective",
    unite: "EUR HT",
    fourchette_min: 50000,
    fourchette_max: 150000,
    note: "Selon puissance et adaptation réseau.",
  },
  {
    code: "cout_pac_air_eau_collective",
    label_fr: "PAC air/eau collective",
    unite: "EUR HT",
    fourchette_min: 100000,
    fourchette_max: 300000,
    note: "Selon puissance, contraintes UE (acoustique, ABF).",
  },
  {
    code: "cout_pac_geothermique_collective",
    label_fr: "PAC géothermique collective",
    unite: "EUR HT",
    fourchette_min: 150000,
    fourchette_max: 400000,
    note: "Forage + installation.",
  },
  {
    code: "cout_chaudiere_biomasse_collective",
    label_fr: "Chaudière biomasse collective (granulés)",
    unite: "EUR HT",
    fourchette_min: 80000,
    fourchette_max: 200000,
    note: "Nécessite stockage silo.",
  },
  {
    code: "cout_raccordement_reseau_chaleur",
    label_fr: "Raccordement à un réseau de chaleur urbain (ex. CPCU)",
    unite: "EUR HT",
    fourchette_min: 7000,
    fourchette_max: 50000,
    note: "Barème CPCU 2022 : kW × 10€ HT (≤20m).",
  },
  // --- PLOMBERIE ---
  {
    code: "cout_remplacement_colonne_eau_lot",
    label_fr: "Remplacement colonne montante eau (par lot)",
    unite: "EUR HT/lot",
    fourchette_min: 500,
    fourchette_max: 1500,
    note: "Cuivre ou PER.",
  },
  {
    code: "cout_remplacement_colonne_evacuation_lot",
    label_fr: "Remplacement colonne d'évacuation (par lot)",
    unite: "EUR HT/lot",
    fourchette_min: 400,
    fourchette_max: 1200,
    note: "Fonte → PVC.",
  },
  // --- ÉLECTRICITÉ PARTIES COMMUNES ---
  {
    code: "cout_mise_conformite_elec_lot",
    label_fr: "Mise en conformité électrique colonnes (par lot)",
    unite: "EUR HT/lot",
    fourchette_min: 300,
    fourchette_max: 800,
    note: "Tableau + câblage commun.",
  },
  {
    code: "cout_remplacement_tableau_unite",
    label_fr: "Remplacement tableau électrique parties communes",
    unite: "EUR HT",
    fourchette_min: 800,
    fourchette_max: 2000,
    note: "Mise à la norme NF C 15-100.",
  },
  // --- VMC / VENTILATION ---
  {
    code: "cout_vmc_collective_simple_flux",
    label_fr: "VMC collective simple flux (installation neuve)",
    unite: "EUR HT",
    fourchette_min: 10000,
    fourchette_max: 30000,
    note: "Double flux ≈ ×2.",
  },
  // --- PARTIES COMMUNES ---
  {
    code: "cout_peinture_cage_escalier_m2",
    label_fr: "Peinture cage d'escalier (sols + murs + plafonds)",
    unite: "EUR HT/m²",
    fourchette_min: 15,
    fourchette_max: 35,
    note: "",
  },
  {
    code: "cout_refection_hall_unite",
    label_fr: "Réfection hall d'entrée (forfait)",
    unite: "EUR HT",
    fourchette_min: 5000,
    fourchette_max: 30000,
    note: "Selon standing souhaité.",
  },
  {
    code: "cout_interphone_lot",
    label_fr: "Interphone audio (par lot)",
    unite: "EUR HT/lot",
    fourchette_min: 150,
    fourchette_max: 500,
    note: "Vidéophone : +50%.",
  },
  // --- DIAGNOSTICS ET ÉTUDES ---
  {
    code: "cout_dpe_collectif",
    label_fr: "DPE collectif",
    unite: "EUR HT",
    fourchette_min: 1000,
    fourchette_max: 5000,
    note: "Obligatoire — toutes copros en 2026.",
  },
  {
    code: "cout_audit_energetique_reglementaire",
    label_fr: "Audit énergétique réglementaire",
    unite: "EUR HT",
    fourchette_min: 5000,
    fourchette_max: 15000,
    note: "Plus complet que le DPE.",
  },
  {
    code: "cout_pppt",
    label_fr: "PPPT (Plan Pluriannuel de Travaux)",
    unite: "EUR HT",
    fourchette_min: 5000,
    fourchette_max: 20000,
    note: "Obligatoire selon taille copro.",
  },
  {
    code: "cout_dtg",
    label_fr: "DTG (Diagnostic Technique Global)",
    unite: "EUR HT",
    fourchette_min: 2000,
    fourchette_max: 15000,
    note: "Petite copro <20 lots: 2-4k€ ; >200 lots: 8-15k€.",
  },
  {
    code: "cout_amo_lot",
    label_fr: "AMO (Assistance Maîtrise d'Ouvrage) MaPrimeRénov'",
    unite: "EUR HT/lot",
    fourchette_min: 600,
    fourchette_max: 1000,
    note: "Obligatoire pour MaPrimeRénov' Copropriété.",
  },
] as const;

export type OrdreGrandeurCoutCode = typeof ORDRE_GRANDEUR_COUTS[number]["code"];

// =============================================================================
// 6. NIVEAUX DE PRIORITÉ DES TRAVAUX (DTG / PPPT)
// =============================================================================

export const NIVEAU_PRIORITE = [
  {
    code: "priorite_1_urgent",
    label_fr: "Priorité 1 — Urgent",
    description: "Travaux nécessaires pour la sécurité ou la conservation de l'immeuble. À engager dans l'année.",
    horizon_annee: "0-1 an",
  },
  {
    code: "priorite_2_necessaire",
    label_fr: "Priorité 2 — Nécessaire",
    description: "Travaux à programmer à court/moyen terme pour maintenir l'usage et limiter la dégradation.",
    horizon_annee: "1-5 ans",
  },
  {
    code: "priorite_3_souhaitable",
    label_fr: "Priorité 3 — Souhaitable",
    description: "Travaux d'amélioration (confort, performance énergétique, valorisation patrimoniale).",
    horizon_annee: "5-10 ans",
  },
] as const;

export type NiveauPrioriteCode = typeof NIVEAU_PRIORITE[number]["code"];

// =============================================================================
// 7. SCÉNARIOS DE TRAVAUX (DTG — gain énergétique cible)
// =============================================================================
// Source : 05a_dtg_rapport_type.md — scénarios chiffrés gain 25%/35%/50%

export const SCENARIO_TRAVAUX_TYPES = [
  {
    code: "scenario_status_quo",
    label_fr: "Scénario A — Status quo (aucun travaux)",
    gain_energetique_cible_pct: 0,
    description: "Référence sans intervention.",
  },
  {
    code: "scenario_gain_25",
    label_fr: "Scénario B — Travaux ciblés (gain ~25%)",
    gain_energetique_cible_pct: 25,
    description: "1 à 2 postes prioritaires (ex. isolation combles + chaudière condensation).",
  },
  {
    code: "scenario_gain_35",
    label_fr: "Scénario C — Bouquet de travaux (gain ~35%)",
    gain_energetique_cible_pct: 35,
    description: "Seuil minimum MaPrimeRénov' Copropriété (gain 35% min, plafond 25 000 €/lot).",
  },
  {
    code: "scenario_gain_50_renovation_ampleur",
    label_fr: "Scénario D — Rénovation d'ampleur (gain ≥ 50%)",
    gain_energetique_cible_pct: 50,
    description: "Saut de plusieurs classes DPE — bonus aides élevées (MPR Copro 45%).",
  },
] as const;

export type ScenarioTravauxCode = typeof SCENARIO_TRAVAUX_TYPES[number]["code"];

// =============================================================================
// EXPORT AGRÉGÉ — DTG_NOMENCLATURE
// =============================================================================

export const DTG_NOMENCLATURE = {
  // Volet 1 — analyse parties communes : on hérite du PPPT
  ...PPPT_NOMENCLATURE,
  // Volet 2 — situation réglementaire et contractuelle
  SYNDICAT_TYPES,
  REGIME_JURIDIQUE_TYPES,
  OBLIGATION_REGLEMENTAIRE_TYPES,
  CONTRAT_EXPLOITATION_TYPES,
  // Volet 3 — gestion technique et financière
  INDICATEUR_FINANCIER_TYPES,
  ORDRE_GRANDEUR_COUTS,
  NIVEAU_PRIORITE,
  SCENARIO_TRAVAUX_TYPES,
} as const;

export type DtgNomenclatureKey = keyof typeof DTG_NOMENCLATURE;
