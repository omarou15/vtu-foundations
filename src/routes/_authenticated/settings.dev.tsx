/**
 * Section "Dev — Inspecteur IA" — Paramètres (Lot 1A lecture seule).
 *
 * Doctrine : page volontairement dense, orientée debug du pipeline IA.
 * 100% lecture. Aucun override (chantier suivant).
 *
 * Trois blocs :
 *  1. Ce qui est envoyé à l'IA — dernier appel (extract ou conversational)
 *     pour la dernière visite avec activité IA. Affiche context_bundle,
 *     recent messages, prompt_summary, raw_response.
 *  2. Ce qui est codé en dur — collections autorisées, rejets, routeur
 *     déterministe (catalogue documentaire en clair).
 *
 * Limite assumée : pour les anciens appels, on n'affiche que ce qui a
 * été persisté dans `llm_extractions` (context_bundle + raw_request_summary
 * + raw_response). Les prompts complets ne sont pas archivés à ce jour ;
 * un futur Lot 2 enrichira l'audit.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Copy, Database, FileWarning, Route as RouteIcon, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb, type LocalLlmExtraction } from "@/shared/db/schema";

export const Route = createFileRoute("/_authenticated/settings/dev")({
  component: DevInspectorPage,
});

// ---------------------------------------------------------------------------
// Catalogues documentaires (Bloc 2)
// ---------------------------------------------------------------------------

const ALLOWED_COLLECTIONS: ReadonlyArray<{ path: string; label: string }> = [
  { path: "heating.installations", label: "Chauffage — installations" },
  { path: "ecs.installations", label: "ECS — installations" },
  { path: "ventilation.installations", label: "Ventilation — installations" },
  { path: "energy_production.installations", label: "Production énergie — installations" },
  { path: "industriel_processes.installations", label: "Process industriels — installations" },
  { path: "tertiaire_hors_cvc.installations", label: "Tertiaire hors CVC — installations" },
  { path: "pathologies.items", label: "Pathologies" },
  { path: "preconisations.items", label: "Préconisations" },
  { path: "notes.items", label: "Notes" },
  { path: "custom_observations.items", label: "Observations personnalisées" },
];

const REJECTION_RULES: ReadonlyArray<{
  code: string;
  origin: "patches" | "insert_entries";
  fr: string;
}> = [
  {
    code: "positional_index_forbidden",
    origin: "patches",
    fr: "Path utilise un index positionnel `[N]` — interdit. Les entrées sont identifiées par UUID.",
  },
  {
    code: "path_not_in_schema",
    origin: "patches",
    fr: "Le path proposé ne correspond à aucun champ déclaré dans le schéma JSON.",
  },
  {
    code: "entry_not_found",
    origin: "patches",
    fr: "Aucune entrée existante avec cet UUID dans la collection ciblée.",
  },
  {
    code: "field_not_in_collection_item",
    origin: "patches",
    fr: "Le champ ciblé n'existe pas sur le schéma de l'item de cette collection.",
  },
  {
    code: "validated_by_human",
    origin: "patches",
    fr: "Le champ a déjà été validé par un humain — l'IA ne peut pas l'écraser.",
  },
  {
    code: "human_source_prime",
    origin: "patches",
    fr: "Conflit : valeur saisie humaine déjà présente. Émet une conflict_card pour arbitrage.",
  },
  {
    code: "unknown_collection",
    origin: "insert_entries",
    fr: "La collection demandée n'existe pas dans le registre.",
  },
  {
    code: "no_valid_fields",
    origin: "insert_entries",
    fr: "L'insert_entry ne contient aucun champ valide reconnu par le schéma de l'item.",
  },
];

const ROUTER_RULES: ReadonlyArray<{ order: number; name: string; route: string; doc: string }> = [
  { order: 1, name: "media", route: "extract", doc: "kind=photo|audio|document → toujours extract." },
  { order: 2, name: "non_user", route: "ignore", doc: "role ≠ user → ignore." },
  { order: 3, name: "empty", route: "ignore", doc: "Texte vide après trim → ignore." },
  { order: 4, name: "noise", route: "ignore", doc: "Patterns bruit : ok / merci / vu / 👍 / emojis seuls." },
  {
    order: 5,
    name: "conversational_hint",
    route: "conversational",
    doc: "« ? », résume, explique, comment, pourquoi, donne, liste… (PRIME sur terrain_pattern).",
  },
  {
    order: 6,
    name: "terrain_pattern",
    route: "extract",
    doc: "Chiffres+unités (m², kW, °C…), codes RT/RE/R+n/HSP, acronymes (VMC, ECS, PAC, ITI, ITE…).",
  },
  {
    order: 7,
    name: "short_capture",
    route: "extract",
    doc: "≤ 4 mots sans hint → extract (capture > conversation).",
  },
  { order: 8, name: "default_extract", route: "extract", doc: "Tout le reste → extract." },
];

// Note : Lot 1A utilise le routage MANUEL via toggle Conv/JSON.
// Le routeur déterministe ci-dessus est gardé en référence pour les modes
// hérités (médias) et pour préparer l'option Auto du Lot 2.

const COMPRESSION_PASSES: ReadonlyArray<{ id: string; name: string; doc: string }> = [
  { id: "0", name: "no_op", doc: "Bundle déjà sous le budget tokens → envoyé tel quel, historique illimité." },
  { id: "1", name: "trim_ocr_500c", doc: "OCR > 500 caractères tronqué (… ajouté). Le moins destructif." },
  { id: "2a", name: "trim_assistant_800c", doc: "Messages assistant > 800 caractères tronqués." },
  { id: "2b", name: "trim_user_1500c", doc: "Messages user > 1500 caractères tronqués." },
  { id: "2c", name: "keep_last_50", doc: "Garde les 50 derniers messages." },
  { id: "2d", name: "keep_last_20", doc: "Garde les 20 derniers messages." },
  { id: "2e", name: "keep_last_8", doc: "Filet final messages : garde les 8 derniers." },
  { id: "3", name: "drop_ocr", doc: "Supprime totalement ocr_text de tous les attachments." },
  { id: "4", name: "strip_details", doc: "Supprime detailed_description + sections non essentielles du state_summary." },
  { id: "5", name: "failed", doc: "Toujours hors budget après toutes les passes → status=failed, l'appel IA est rejeté." },
];

// ---------------------------------------------------------------------------
// Composant racine
// ---------------------------------------------------------------------------

function DevInspectorPage() {
  return (
    <div className="flex flex-col">
      <header className="safe-top safe-x sticky top-0 z-10 border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            to="/"
            className="touch-target inline-flex items-center justify-center rounded-md text-foreground hover:bg-accent"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Dev — Inspecteur IA
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Inspecteur IA
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Diagnostic complet du pipeline IA. Lecture seule. Sert à comprendre
            ce qui est envoyé au modèle et pourquoi certaines propositions sont
            ensuite filtrées côté apply.
          </p>
        </header>

        <Block1LastCall />
        <Block2Hardcoded />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloc 1 — Ce qui est envoyé à l'IA (dernier appel)
// ---------------------------------------------------------------------------

function Block1LastCall() {
  const lastCall = useLiveQuery(async () => {
    const db = getDb();
    const all = await db.llm_extractions
      .orderBy("created_at")
      .reverse()
      .limit(50)
      .toArray();
    // On privilégie les modes "extract_from_message" et "conversational_query"
    return (
      all.find(
        (e) =>
          e.mode === "extract_from_message" || e.mode === "conversational_query",
      ) ?? all[0] ?? null
    );
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        icon={<Database className="h-4 w-4" />}
        title="Bloc 1 — Ce qui est envoyé à l'IA"
        subtitle="Dernier appel IA persisté localement (extract ou conversational)."
      />
      {lastCall === undefined ? (
        <CardShell>
          <p className="font-body text-sm text-muted-foreground">Chargement…</p>
        </CardShell>
      ) : !lastCall ? (
        <CardShell>
          <p className="font-body text-sm text-muted-foreground">
            Aucun appel IA enregistré localement pour le moment.
          </p>
        </CardShell>
      ) : (
        <CallInspector call={lastCall} />
      )}
    </section>
  );
}

function CallInspector({ call }: { call: LocalLlmExtraction }) {
  const bundle = call.context_bundle as Record<string, unknown> | null;
  const recent = useMemo(() => {
    if (!bundle) return null;
    const r = (bundle as { recent_messages?: unknown }).recent_messages;
    return Array.isArray(r) ? r : null;
  }, [bundle]);

  return (
    <CardShell>
      {/* Header méta */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Badge variant="outline" className="font-ui">{call.mode}</Badge>
        <Badge variant={call.status === "success" ? "default" : "destructive"} className="font-ui">
          {call.status}
        </Badge>
        <Badge variant="secondary" className="font-ui">{call.model_version}</Badge>
        <span className="font-ui text-xs text-muted-foreground">
          {new Date(call.created_at).toLocaleString("fr-FR")}
        </span>
        {call.latency_ms != null && (
          <span className="font-ui text-xs text-muted-foreground">
            {call.latency_ms} ms
          </span>
        )}
        {call.input_tokens != null && (
          <span className="font-ui text-xs text-muted-foreground">
            in:{call.input_tokens} / out:{call.output_tokens ?? "?"}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <JsonAccordion label="Context bundle complet" data={bundle} defaultOpen />
        <JsonAccordion
          label={`Historique réellement envoyé (${recent?.length ?? 0} messages — illimité par défaut, compression progressive si dépassement budget)`}
          data={recent ?? "Non disponible dans ce dump"}
        />
        <JsonAccordion
          label="Schema map (collections autorisées + entrées existantes)"
          data={(bundle as { schema_map?: unknown } | null)?.schema_map ?? "Non disponible"}
        />
        <JsonAccordion
          label="Descriptions photos incluses"
          data={(bundle as { attachment_descriptions?: unknown } | null)?.attachment_descriptions ?? []}
        />
        <JsonAccordion
          label="raw_request_summary (résumé du prompt côté engine)"
          data={call.raw_request_summary}
        />
        <JsonAccordion
          label="Réponse brute du modèle (raw_response)"
          data={call.raw_response}
        />
        {call.warnings && call.warnings.length > 0 && (
          <JsonAccordion label="Warnings" data={call.warnings} defaultOpen />
        )}
        {call.error_message && (
          <p className="font-body rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <strong className="font-ui font-semibold">Erreur : </strong>
            {call.error_message}
          </p>
        )}
        <p className="font-body mt-2 text-[11px] italic text-muted-foreground">
          Limite connue : le prompt système et le prompt utilisateur assemblé
          ne sont pas persistés pour ce dump. Un futur lot Dev les
          enregistrera dans <code className="font-ui">raw_request_summary</code>.
        </p>
      </div>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Bloc 2 — Ce qui est codé en dur
// ---------------------------------------------------------------------------

function Block2Hardcoded() {
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Bloc 2 — Ce qui est codé en dur"
        subtitle="Règles internes du pipeline IA, exposées sans rien cacher."
      />

      {/* Collections autorisées */}
      <CardShell>
        <h4 className="font-heading text-sm font-semibold text-foreground">
          Collections autorisées (insert_entry)
        </h4>
        <p className="font-body mt-1 text-xs text-muted-foreground">
          Source : <code className="font-ui">COLLECTIONS_REGISTRY</code> dans
          <code className="font-ui"> json-state.schema-map.ts</code>. Toute autre
          collection sera rejetée avec <code className="font-ui">unknown_collection</code>.
        </p>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {ALLOWED_COLLECTIONS.map((c) => (
            <li
              key={c.path}
              className="flex items-baseline gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              <code className="font-ui text-[11px] font-medium text-primary">{c.path}</code>
              <span className="font-body text-xs text-muted-foreground">{c.label}</span>
            </li>
          ))}
        </ul>
      </CardShell>

      {/* Règles de rejet */}
      <CardShell>
        <h4 className="font-heading flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileWarning className="h-4 w-4 text-muted-foreground" />
          Règles de rejet post-LLM
        </h4>
        <p className="font-body mt-1 text-xs text-muted-foreground">
          Codes appliqués par <code className="font-ui">apply-patches.ts</code> et
          <code className="font-ui"> apply-insert-entries.ts</code> après réception
          de la réponse modèle. Un patch rejeté n'est jamais écrit dans le state.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {REJECTION_RULES.map((r) => (
            <li
              key={r.code}
              className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2.5"
            >
              <div className="flex items-center gap-2">
                <code className="font-ui text-xs font-semibold text-destructive">
                  {r.code}
                </code>
                <Badge variant="outline" className="font-ui text-[10px]">
                  {r.origin}
                </Badge>
              </div>
              <p className="font-body text-xs text-muted-foreground">{r.fr}</p>
            </li>
          ))}
        </ul>
      </CardShell>

      {/* Compression progressive du context bundle */}
      <CardShell>
        <h4 className="font-heading flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileWarning className="h-4 w-4 text-muted-foreground" />
          Compression progressive du context bundle
        </h4>
        <p className="font-body mt-1 text-xs text-muted-foreground">
          L'historique est <strong>illimité par défaut</strong>. Si le bundle
          dépasse le budget tokens (~12 000), <code className="font-ui">compress.ts</code> applique
          ces passes dans l'ordre, en sortant dès qu'on repasse sous le budget.
        </p>
        <ol className="mt-3 flex flex-col gap-1.5">
          {COMPRESSION_PASSES.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-[auto_auto_1fr] items-baseline gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              <span className="font-ui text-[11px] font-semibold text-muted-foreground">
                {p.id}
              </span>
              <code className="font-ui text-[11px] font-medium text-primary">
                {p.name}
              </code>
              <span className="font-body text-xs text-muted-foreground">{p.doc}</span>
            </li>
          ))}
        </ol>
      </CardShell>

      {/* Routeur déterministe */}
      <CardShell>
        <h4 className="font-heading flex items-center gap-2 text-sm font-semibold text-foreground">
          <RouteIcon className="h-4 w-4 text-muted-foreground" />
          Routeur déterministe (référence)
        </h4>
        <p className="font-body mt-1 text-xs text-muted-foreground">
          Le routage automatique a été remplacé par le toggle manuel
          Conv / JSON dans le chat. Ces règles restent en référence : elles
          servent encore pour le routage des médias et pourront être
          réactivées en mode Auto dans un Lot ultérieur.
        </p>
        <ol className="mt-3 flex flex-col gap-1.5">
          {ROUTER_RULES.map((r) => (
            <li
              key={r.name}
              className="grid grid-cols-[auto_auto_auto_1fr] items-baseline gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              <span className="font-ui text-[11px] font-semibold text-muted-foreground">
                #{r.order}
              </span>
              <code className="font-ui text-[11px] font-medium text-primary">
                {r.name}
              </code>
              <Badge variant="outline" className="font-ui text-[10px]">
                {r.route}
              </Badge>
              <span className="font-body text-xs text-muted-foreground">{r.doc}</span>
            </li>
          ))}
        </ol>
      </CardShell>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Primitives UI internes
// ---------------------------------------------------------------------------

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="font-heading flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      <p className="font-body text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {children}
    </div>
  );
}

function JsonAccordion({
  label,
  data,
  defaultOpen = false,
}: {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const json = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  function copy() {
    void navigator.clipboard.writeText(json).then(
      () => toast.success("Copié dans le presse-papier"),
      () => toast.error("Échec de la copie"),
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-ui flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/60"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="relative bg-background">
          <div className="absolute right-2 top-2 z-10">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={copy}
            >
              <Copy className="mr-1 h-3 w-3" />
              <span className="font-ui text-[10px]">Copier</span>
            </Button>
          </div>
          <pre className="font-ui max-h-96 overflow-auto p-3 pr-20 text-[11px] leading-relaxed text-foreground">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
