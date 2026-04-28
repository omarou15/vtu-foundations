/**
 * Carte BYOK — saisie + gestion de la clé OpenRouter de l'utilisateur.
 *
 * UX : toggle "Utiliser ma propre clé". OFF → grille modèles Lovable
 * standard. ON → input clé + dropdown modèle OpenRouter.
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
} from "../openrouter-models";
import {
  deleteByokKey,
  getByokState,
  saveByokKey,
  updateByokToggle,
  type ByokState,
} from "../byok.repo";

interface ByokCardProps {
  onToggleChange?: (enabled: boolean) => void;
}

export function ByokCard({ onToggleChange }: ByokCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ByokState>({
    has_key: false,
    enabled: false,
    model_id: null,
  });
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelId, setModelId] = useState<string>(DEFAULT_OPENROUTER_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    getByokState()
      .then((s) => {
        setState(s);
        if (s.model_id) {
          const known = OPENROUTER_MODELS.find((m) => m.id === s.model_id);
          if (known) {
            setModelId(s.model_id);
            setUseCustom(false);
          } else {
            setCustomModel(s.model_id);
            setUseCustom(true);
          }
        }
      })
      .catch((e) => {
        console.error(e);
        toast.error("Impossible de charger l'état BYOK");
      })
      .finally(() => setLoading(false));
  }, []);

  const effectiveModelId = useCustom ? customModel.trim() : modelId;

  async function handleToggle(next: boolean) {
    if (next && !state.has_key) {
      toast.error("Renseigne d'abord ta clé OpenRouter et enregistre.");
      return;
    }
    try {
      setSaving(true);
      await updateByokToggle({ enabled: next, modelId: effectiveModelId });
      setState((s) => ({ ...s, enabled: next, model_id: effectiveModelId }));
      onToggleChange?.(next);
      toast.success(
        next ? "Clé OpenRouter activée" : "Retour aux modèles Lovable AI",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!apiKey.trim() && !state.has_key) {
      toast.error("Saisis d'abord ta clé OpenRouter.");
      return;
    }
    if (!effectiveModelId) {
      toast.error("Choisis un modèle ou saisis un model_id custom.");
      return;
    }
    try {
      setSaving(true);
      if (apiKey.trim()) {
        // Nouvelle clé saisie
        await saveByokKey({
          apiKey,
          modelId: effectiveModelId,
          enabled: state.enabled,
        });
        setApiKey("");
        setState((s) => ({
          ...s,
          has_key: true,
          model_id: effectiveModelId,
        }));
      } else {
        // Pas de nouvelle clé, juste update modèle
        await updateByokToggle({
          enabled: state.enabled,
          modelId: effectiveModelId,
        });
        setState((s) => ({ ...s, model_id: effectiveModelId }));
      }
      toast.success("Configuration enregistrée");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      setSaving(true);
      await deleteByokKey();
      setState({ has_key: false, enabled: false, model_id: null });
      setApiKey("");
      onToggleChange?.(false);
      toast.success("Clé supprimée");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="byok-toggle" className="font-heading text-sm font-semibold">
            Utiliser ma propre clé OpenRouter
          </Label>
          <p className="font-body text-xs text-muted-foreground">
            Accède à Claude Sonnet 4.5, GPT-5, Opus 4 et 200+ autres modèles.
            La facturation se fait directement sur ton compte OpenRouter.
          </p>
        </div>
        <Switch
          id="byok-toggle"
          checked={state.enabled}
          disabled={saving}
          onCheckedChange={handleToggle}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="byok-key" className="font-body text-xs font-medium">
            Clé API OpenRouter{" "}
            {state.has_key && (
              <span className="text-primary">(clé enregistrée)</span>
            )}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="byok-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  state.has_key
                    ? "Laisser vide pour conserver la clé actuelle"
                    : "sk-or-v1-…"
                }
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showKey ? "Masquer" : "Afficher"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {state.has_key && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleDelete}
                disabled={saving}
                aria-label="Supprimer la clé"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="font-body text-[11px] text-muted-foreground">
            Récupère ta clé sur{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              openrouter.ai/keys
            </a>
            . Elle est stockée chiffrée côté serveur et n'est jamais ré-exposée.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="font-body text-xs font-medium">Modèle</Label>
          {!useCustom ? (
            <Select
              value={modelId}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setUseCustom(true);
                } else {
                  setModelId(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENROUTER_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">
                  Custom (saisir un model_id…)
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="provider/model-id"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setUseCustom(false);
                  setCustomModel("");
                }}
              >
                Liste
              </Button>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
