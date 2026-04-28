/**
 * VTU — Éditeur du prompt système LLM.
 *
 * Affiché en tête de `/settings/dev`. Permet au dev de modifier le prompt
 * système envoyé au LLM sans toucher au code ni redéployer.
 *
 * Comportement :
 *  - Au mount : charge le prompt actif depuis la DB. Si aucun → préremplit
 *    avec la constante par défaut + badge "Défaut (non sauvegardé)".
 *  - Sauvegarder : crée une nouvelle version active (trigger désactive l'ancienne).
 *  - Réinitialiser au défaut : repeuple la textarea avec la constante.
 *  - Annuler : recharge depuis la DB.
 *  - Historique : liste les versions, possibilité d'en réactiver une.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, RotateCcw, History, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SYSTEM_UNIFIED } from "@/shared/llm/prompts/system-unified";
import {
  activateSystemPrompt,
  getActiveSystemPrompt,
  listSystemPrompts,
  saveSystemPrompt,
  SYSTEM_PROMPT_MAX_LENGTH,
  SYSTEM_PROMPT_MIN_LENGTH,
  type SystemPromptRow,
} from "./system-prompt.repo";

export function SystemPromptEditor() {
  const [active, setActive] = useState<SystemPromptRow | null>(null);
  const [history, setHistory] = useState<SystemPromptRow[]>([]);
  const [content, setContent] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [act, list] = await Promise.all([
        getActiveSystemPrompt(),
        listSystemPrompts(),
      ]);
      setActive(act);
      setHistory(list);
      setContent(act?.content ?? SYSTEM_UNIFIED);
      setLabel("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const isDefault = active === null;
  const isDirty = content !== (active?.content ?? SYSTEM_UNIFIED);
  const length = content.length;
  const tooShort = length < SYSTEM_PROMPT_MIN_LENGTH;
  const tooLong = length > SYSTEM_PROMPT_MAX_LENGTH;
  const canSave = isDirty && !tooShort && !tooLong && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      await saveSystemPrompt(content, label || null);
      toast.success("Prompt système mis à jour. Actif au prochain message.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleResetToDefault() {
    setContent(SYSTEM_UNIFIED);
    toast.message("Prompt par défaut chargé. Clique « Sauvegarder » pour activer.");
  }

  function handleCancel() {
    setContent(active?.content ?? SYSTEM_UNIFIED);
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
          Prompt système (éditable)
        </h3>
        <p className="font-body text-xs text-muted-foreground">
          Modifie ici le prompt envoyé au LLM à chaque appel. La sauvegarde crée
          une nouvelle version active immédiatement (pas de redéploiement).
        </p>
      </div>

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
