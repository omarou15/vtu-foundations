/**
 * VTU — Éditeur des prompts système LLM.
 *
 * Affiché en tête de `/settings/dev`. Permet au dev de modifier les deux
 * prompts système (chat unifié et analyse photo) sans toucher au code.
 *
 * Comportement :
 *  - Sélecteur en tête : « Prompt chat » / « Prompt analyse photo ».
 *  - Au mount / changement d'onglet : charge le prompt actif du `kind`
 *    sélectionné. Si aucun → préremplit avec la constante par défaut +
 *    badge "Défaut (non sauvegardé)".
 *  - Sauvegarder : crée une nouvelle version active (trigger désactive
 *    l'ancienne du même kind).
 *  - Réinitialiser au défaut : repeuple la textarea avec la constante.
 *  - Annuler : recharge depuis la DB.
 *  - Historique : liste les versions du kind courant, possibilité d'en
 *    réactiver une.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, RotateCcw, History, Check, MessageSquare, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SYSTEM_UNIFIED } from "@/shared/llm/prompts/system-unified";
import { SYSTEM_DESCRIBE_MEDIA } from "@/shared/llm/prompts/system-describe-media";
import {
  activateSystemPrompt,
  getActiveSystemPrompt,
  listSystemPrompts,
  saveSystemPrompt,
  SYSTEM_PROMPT_MAX_LENGTH,
  SYSTEM_PROMPT_MIN_LENGTH,
  type SystemPromptKind,
  type SystemPromptRow,
} from "./system-prompt.repo";

const KIND_META: Record<SystemPromptKind, { label: string; defaultContent: string; helper: string; Icon: typeof MessageSquare }> = {
  unified: {
    label: "Prompt chat",
    defaultContent: SYSTEM_UNIFIED,
    helper: "Envoyé à chaque message texte du thermicien (edge function vtu-llm-agent).",
    Icon: MessageSquare,
  },
  describe_media: {
    label: "Prompt analyse photo",
    defaultContent: SYSTEM_DESCRIBE_MEDIA,
    helper: "Envoyé pour chaque photo / plan analysé individuellement (server function describeMedia).",
    Icon: ImageIcon,
  },
};

export function SystemPromptEditor() {
  const [kind, setKind] = useState<SystemPromptKind>("unified");
  const [active, setActive] = useState<SystemPromptRow | null>(null);
  const [history, setHistory] = useState<SystemPromptRow[]>([]);
  const [content, setContent] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const meta = KIND_META[kind];

  async function refresh(targetKind: SystemPromptKind = kind) {
    setLoading(true);
    try {
      const [act, list] = await Promise.all([
        getActiveSystemPrompt(targetKind),
        listSystemPrompts(targetKind),
      ]);
      setActive(act);
      setHistory(list);
      setContent(act?.content ?? KIND_META[targetKind].defaultContent);
      setLabel("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const isDefault = active === null;
  const isDirty = content !== (active?.content ?? meta.defaultContent);
  const length = content.length;
  const tooShort = length < SYSTEM_PROMPT_MIN_LENGTH;
  const tooLong = length > SYSTEM_PROMPT_MAX_LENGTH;
  const canSave = isDirty && !tooShort && !tooLong && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      await saveSystemPrompt(content, label || null, kind);
      toast.success(`${meta.label} mis à jour. Actif au prochain appel.`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleResetToDefault() {
    setContent(meta.defaultContent);
    toast.message("Prompt par défaut chargé. Clique « Sauvegarder » pour activer.");
  }

  function handleCancel() {
    setContent(active?.content ?? meta.defaultContent);
    setLabel("");
  }

  async function handleActivate(row: SystemPromptRow) {
    try {
      await activateSystemPrompt(row.id);
      toast.success(
        `Version ${row.label ?? row.id.slice(0, 6)} activée.`,
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4" />
          Prompts système (éditables)
        </h3>
        <p className="font-body text-xs text-muted-foreground">
          Modifie ici les prompts envoyés au LLM. La sauvegarde crée une
          nouvelle version active immédiatement (pas de redéploiement).
        </p>
      </div>

      {/* Tabs kind */}
      <div
        className="mt-3 inline-flex self-start rounded-lg bg-muted p-0.5"
        role="tablist"
        aria-label="Type de prompt"
      >
        {(Object.keys(KIND_META) as SystemPromptKind[]).map((k) => {
          const m = KIND_META[k];
          const selected = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setKind(k)}
              disabled={saving}
              className={[
                "font-ui inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <m.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="font-body mt-2 text-[11px] text-muted-foreground">
        {meta.helper}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isDefault ? (
          <Badge variant="outline" className="font-ui">
            Défaut (non sauvegardé)
          </Badge>
        ) : (
          <Badge variant="default" className="font-ui">
            Version active
          </Badge>
        )}
        {active?.label && (
          <Badge variant="secondary" className="font-ui">
            {active.label}
          </Badge>
        )}
        {active && (
          <span className="font-ui text-[11px] text-muted-foreground">
            Sauvegardée le{" "}
            {new Date(active.created_at).toLocaleString("fr-FR")}
          </span>
        )}
        <span
          className={`font-ui ml-auto text-[11px] ${
            tooLong || tooShort ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {length.toLocaleString("fr-FR")} / {SYSTEM_PROMPT_MAX_LENGTH.toLocaleString("fr-FR")} caractères
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="font-ui text-[11px] font-medium text-muted-foreground">
          Libellé optionnel (ex : « v3 — ton plus direct »)
        </label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="v3 — …"
          disabled={loading || saving}
          maxLength={120}
          className="font-ui text-xs"
        />
      </div>

      <div className="mt-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading || saving}
          rows={20}
          spellCheck={false}
          className="font-ui min-h-[28rem] whitespace-pre text-[11px] leading-relaxed"
        />
        {tooShort && (
          <p className="font-body mt-1 text-[11px] text-destructive">
            Minimum {SYSTEM_PROMPT_MIN_LENGTH} caractères.
          </p>
        )}
        {tooLong && (
          <p className="font-body mt-1 text-[11px] text-destructive">
            Maximum {SYSTEM_PROMPT_MAX_LENGTH} caractères.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetToDefault}
          disabled={loading || saving}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          <span className="font-ui text-xs">Réinitialiser au défaut</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={loading || saving || !isDirty}
        >
          <span className="font-ui text-xs">Annuler</span>
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={!canSave}
          className="ml-auto"
        >
          <Check className="mr-1 h-3 w-3" />
          <span className="font-ui text-xs">
            {saving ? "Enregistrement…" : "Sauvegarder"}
          </span>
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="font-ui flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={historyOpen}
          >
            <span className="flex items-center gap-2">
              <History className="h-3 w-3" />
              Historique ({history.length} version{history.length > 1 ? "s" : ""})
            </span>
            <span className="text-[10px]">{historyOpen ? "▾" : "▸"}</span>
          </button>
          {historyOpen && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
                >
                  <span className="font-ui truncate text-[11px] text-foreground">
                    {row.label ?? `(sans libellé) ${row.id.slice(0, 6)}`}
                  </span>
                  <span className="font-ui text-[10px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("fr-FR")}
                  </span>
                  {row.is_active && (
                    <Badge variant="default" className="font-ui text-[10px]">
                      actif
                    </Badge>
                  )}
                  <span className="font-ui text-[10px] text-muted-foreground">
                    {row.content.length.toLocaleString("fr-FR")} c
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setContent(row.content)}
                    >
                      <span className="font-ui text-[10px]">Charger</span>
                    </Button>
                    {!row.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => void handleActivate(row)}
                      >
                        <span className="font-ui text-[10px]">Activer</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
