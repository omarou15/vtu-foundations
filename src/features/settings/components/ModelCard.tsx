/**
 * Card d'un modèle IA (It. 11.7).
 *
 * Affiche : tier, nom, description, prix in/out par M tokens, indicateur
 * recall (barre + label). Click → sélection.
 */

import { Check } from "lucide-react";
import type { ModelCatalogEntry } from "../models-catalog";

interface ModelCardProps {
  model: ModelCatalogEntry;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function formatUsd(value: number): string {
  return value < 1
    ? `${value.toFixed(2)} $`
    : `${value.toFixed(2).replace(/\.00$/, "")} $`;
}

function recallColor(recall: number): string {
  if (recall >= 0.85) return "bg-success";
  if (recall >= 0.65) return "bg-primary";
  return "bg-warning";
}

export function ModelCard({
  model,
  selected,
  disabled = false,
  onSelect,
}: ModelCardProps) {
  const recallPct = Math.round(model.estimatedRecall * 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "group relative flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all",
        "min-h-[180px]",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:shadow-md",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      {/* Selected indicator */}
      {selected ? (
        <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}

      {/* Header : tier badge + label */}
      <div className="flex flex-col gap-1">
        <span className="font-ui inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {model.label}
        </span>
        <h3 className="font-heading text-base font-semibold text-foreground">
          {model.modelId.split("/").pop()}
        </h3>
      </div>

      {/* Description */}
      <p className="font-body text-xs leading-relaxed text-muted-foreground">
        {model.description}
      </p>

      {/* Pricing */}
      <div className="font-ui flex items-center gap-1 text-[11px] tabular-nums text-foreground">
        <span className="text-muted-foreground">Entrée</span>
        <span className="font-medium">
          {formatUsd(model.pricePerMTokensInput)}
        </span>
        <span className="text-muted-foreground">/ M</span>
        <span className="px-1 text-muted-foreground">·</span>
        <span className="text-muted-foreground">Sortie</span>
        <span className="font-medium">
          {formatUsd(model.pricePerMTokensOutput)}
        </span>
        <span className="text-muted-foreground">/ M</span>
      </div>

      {/* Recall */}
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-ui text-[11px] text-muted-foreground">
            Recall estimé
          </span>
          <span className="font-ui text-[11px] font-medium tabular-nums text-foreground">
            {recallPct}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${recallColor(model.estimatedRecall)}`}
            style={{ width: `${recallPct}%` }}
          />
        </div>
      </div>
    </button>
  );
}
