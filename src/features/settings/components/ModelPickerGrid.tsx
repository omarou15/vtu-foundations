/**
 * Grille des 4 ModelCards (It. 11.7).
 *
 * Mobile : colonne unique. md+ : 2x2.
 */

import { MODELS_CATALOG, type ModelTier } from "../models-catalog";
import { ModelCard } from "./ModelCard";

interface ModelPickerGridProps {
  selected: ModelTier;
  disabled?: boolean;
  onSelect: (tier: ModelTier) => void;
}

export function ModelPickerGrid({
  selected,
  disabled = false,
  onSelect,
}: ModelPickerGridProps) {
  return (
    <div
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
      role="radiogroup"
      aria-label="Choix du modèle IA"
    >
      {MODELS_CATALOG.map((m) => (
        <ModelCard
          key={m.tier}
          model={m}
          selected={selected === m.tier}
          disabled={disabled}
          onSelect={() => onSelect(m.tier)}
        />
      ))}
    </div>
  );
}
