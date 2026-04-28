/**
 * Section "IA & Modèles" — Paramètres (It. 11.7).
 *
 * Contient :
 *  - Toggle global IA (kill-switch synchronisé avec le toggle per-visit du chat)
 *  - Sélecteur de modèle (4 tiers : économique / moyen / supérieur / premium)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Bot, Copy, FileCode, MessageSquare, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/features/chat";
import {
  AiToggleCard,
  ModelPickerGrid,
  getModelByTier,
  type ModelTier,
} from "@/features/settings";
import { getDb, type LocalLlmExtraction } from "@/shared/db/schema";

export const Route = createFileRoute("/_authenticated/settings/ai")({
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const aiGlobalEnabled = useChatStore((s) => s.aiGlobalEnabled);
  const setAiGlobalEnabled = useChatStore((s) => s.setAiGlobalEnabled);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);

  function handleToggle(value: boolean) {
    setAiGlobalEnabled(value);
    toast.success(
      value ? "IA activée globalement" : "IA désactivée globalement",
      {
        description: value
          ? "Les visites qui ont activé l'IA reprennent leur fonctionnement normal."
          : "Aucun message ne sera envoyé au modèle, même sur les visites avec IA activée.",
      },
    );
  }

  function handleModelSelect(tier: ModelTier) {
    if (tier === selectedModel) return;
    setSelectedModel(tier);
    const model = getModelByTier(tier);
    toast.success(`Modèle changé : ${model.label}`, {
      description: model.modelId,
    });
  }

  return (
    <div className="flex flex-col">
      {/* Header mobile (back + titre). Desktop affiche déjà la SettingsSidebar. */}
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
            Paramètres
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10 safe-bottom">
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            IA &amp; Modèles
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            Contrôlez l'utilisation de l'IA et choisissez le modèle qui
            convient le mieux à votre usage terrain.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Activation
          </h3>
          <AiToggleCard enabled={aiGlobalEnabled} onChange={handleToggle} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Modèle
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Le modèle sélectionné est utilisé pour toutes les nouvelles
              extractions et conversations IA.
            </p>
          </div>
          <ModelPickerGrid
            selected={selectedModel}
            disabled={!aiGlobalEnabled}
            onSelect={handleModelSelect}
          />
          <p className="font-body mt-2 text-[11px] text-muted-foreground">
            Tarifs indicatifs Lovable AI (USD pour 1&nbsp;million de tokens).
            Le recall est une estimation interne sur des saisies terrain
            représentatives — ce n'est pas une garantie.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Inspecteur — dernier appel IA
            </h3>
            <p className="font-body text-xs text-muted-foreground">
              Ce qui est <strong>réellement</strong> envoyé au LLM lors du
              dernier appel chat (prompt système, historique, message user,
              réponse brute).
            </p>
          </div>
          <LastCallSection />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspecteur — dernier appel IA (live depuis `llm_extractions`)
// ---------------------------------------------------------------------------

function LastCallSection() {
  const lastCall = useLiveQuery(async () => {
    const db = getDb();
    const all = await db.llm_extractions
      .orderBy("created_at")
      .reverse()
      .limit(50)
      .toArray();
    return (
      all.find(
        (e) =>
          e.mode === "extract_from_message" || e.mode === "conversational_query",
      ) ?? all[0] ?? null
    );
  }, []);

  if (lastCall === undefined) {
    return (
      <CardShell>
        <p className="font-body text-sm text-muted-foreground">Chargement…</p>
      </CardShell>
    );
  }
  if (!lastCall) {
    return (
      <CardShell>
        <p className="font-body text-sm text-muted-foreground">
          Aucun appel IA enregistré localement pour le moment. Lance une
          conversation depuis le chat pour voir apparaître les détails ici.
        </p>
      </CardShell>
    );
  }
  return <CallInspector call={lastCall} />;
}

interface RequestSummary {
  system_prompt?: string;
  history_messages?: Array<{ role: string; content: string }>;
  user_prompt?: string;
  model?: string;
  mode?: string;
}

function CallInspector({ call }: { call: LocalLlmExtraction }) {
  const summary = call.raw_request_summary as RequestSummary | null;

  const systemPrompt = typeof summary?.system_prompt === "string"
    ? summary.system_prompt
    : null;
  const historyMessages = Array.isArray(summary?.history_messages)
    ? summary.history_messages
    : null;
  const userPrompt = typeof summary?.user_prompt === "string"
    ? summary.user_prompt
    : null;

  const captured = systemPrompt !== null;

  return (
    <div className="flex flex-col gap-4">
      <CardShell>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-ui">{call.mode}</Badge>
          <Badge
            variant={call.status === "success" ? "default" : "destructive"}
            className="font-ui"
          >
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
        {call.error_message && (
          <p className="font-body mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <strong className="font-ui font-semibold">Erreur : </strong>
            {call.error_message}
          </p>
        )}
        {!captured && (
          <p className="font-body mt-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground">
            Cet appel a été fait avant l'instrumentation du wire. Les blocs
            ci-dessous afficheront « Non capturé ». Lance un nouveau message
            depuis le chat pour voir le contenu réel.
          </p>
        )}
      </CardShell>

      <PromptCard
        icon={<Wrench className="h-4 w-4" />}
        title="1. Prompt système"
        subtitle="Instruction figée envoyée comme premier message au LLM."
        content={systemPrompt}
        defaultOpen={false}
      />

      <CardShell>
        <SectionHeader
          icon={<MessageSquare className="h-4 w-4" />}
          title={`2. Historique chat envoyé${
            historyMessages ? ` (${historyMessages.length} messages)` : ""
          }`}
          subtitle="Les derniers messages user/assistant promus en multi-tour (filtrés et tronqués à 1000c côté edge function)."
        />
        {historyMessages === null ? (
          <p className="font-body mt-3 text-xs italic text-muted-foreground">
            Non capturé.
          </p>
        ) : historyMessages.length === 0 ? (
          <p className="font-body mt-3 text-xs italic text-muted-foreground">
            Aucun historique envoyé (premier message de la visite).
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {historyMessages.map((m, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-muted/30 p-2.5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    variant={m.role === "user" ? "default" : "secondary"}
                    className="font-ui text-[10px]"
                  >
                    {m.role}
                  </Badge>
                  <span className="font-ui text-[10px] text-muted-foreground">
                    {String(m.content ?? "").length} chars
                  </span>
                </div>
                <pre className="font-ui whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground">
                  {String(m.content ?? "")}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </CardShell>

      <PromptCard
        icon={<FileCode className="h-4 w-4" />}
        title="3. Dernier message user"
        subtitle="Bloc assemblé envoyé comme dernier message : JSON state complet de la VT + message courant du thermicien."
        content={userPrompt}
        defaultOpen
      />

      <CardShell>
        <SectionHeader
          icon={<Bot className="h-4 w-4" />}
          title="4. Réponse du LLM"
          subtitle="Tool-call brut propose_visit_patches renvoyé par le modèle."
        />
        <div className="mt-3">
          <JsonBlock data={call.raw_response} />
        </div>
        {call.warnings && call.warnings.length > 0 && (
          <div className="mt-3">
            <p className="font-ui mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Warnings
            </p>
            <JsonBlock data={call.warnings} />
          </div>
        )}
      </CardShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives UI internes
// ---------------------------------------------------------------------------

function SectionHeader({
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
      <h3 className="font-heading flex items-center gap-2 text-sm font-semibold text-foreground">
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

function PromptCard({
  icon,
  title,
  subtitle,
  content,
  defaultOpen,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  content: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function copy() {
    if (content === null) return;
    void navigator.clipboard.writeText(content).then(
      () => toast.success("Copié dans le presse-papier"),
      () => toast.error("Échec de la copie"),
    );
  }

  return (
    <CardShell>
      <SectionHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="mt-3 overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-ui flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/60"
          aria-expanded={open}
        >
          <span className="truncate">
            {content === null
              ? "Non capturé"
              : `${content.length.toLocaleString("fr-FR")} caractères`}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {open ? "▾" : "▸"}
          </span>
        </button>
        {open && content !== null && (
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
            <pre className="font-ui max-h-[28rem] overflow-auto whitespace-pre-wrap break-words p-3 pr-20 text-[11px] leading-relaxed text-foreground">
              {content}
            </pre>
          </div>
        )}
        {open && content === null && (
          <div className="bg-background p-3">
            <p className="font-body text-xs italic text-muted-foreground">
              Cet appel a été fait avant l'instrumentation. Lance un nouveau
              message pour voir le contenu envoyé au LLM.
            </p>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function JsonBlock({ data }: { data: unknown }) {
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
    <div className="relative overflow-hidden rounded-md border border-border bg-background">
      <div className="absolute right-2 top-2 z-10">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copy}>
          <Copy className="mr-1 h-3 w-3" />
          <span className="font-ui text-[10px]">Copier</span>
        </Button>
      </div>
      <pre className="font-ui max-h-96 overflow-auto p-3 pr-20 text-[11px] leading-relaxed text-foreground">
        {json}
      </pre>
    </div>
  );
}
