import { useEffect, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BuildingType, MissionType } from "@/shared/types";

/**
 * Modal de création de VT — Itération 4.
 *
 * Validation client : tous les champs requis (title non vide, adresse
 * non vide, mission_type, building_type). Bouton submit disabled tant
 * que le form est invalide. Validation côté serveur viendra à It.6.
 */

const newVisitSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(120),
  address: z.string().trim().min(1, "Adresse requise").max(255),
  mission_type: z.enum(["audit_energetique", "dpe", "conseil", "autre"]),
  building_type: z.enum([
    "maison_individuelle",
    "appartement",
    "immeuble",
    "tertiaire",
    "autre",
  ]),
});
export type NewVisitFormValue = z.infer<typeof newVisitSchema>;

interface NewVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: NewVisitFormValue) => Promise<void> | void;
}

const MISSION_OPTIONS: { value: MissionType; label: string }[] = [
  { value: "audit_energetique", label: "Audit énergétique" },
  { value: "dpe", label: "DPE" },
  { value: "conseil", label: "Conseil" },
  { value: "autre", label: "Autre" },
];

const BUILDING_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: "maison_individuelle", label: "Maison individuelle" },
  { value: "appartement", label: "Appartement" },
  { value: "immeuble", label: "Immeuble" },
  { value: "tertiaire", label: "Tertiaire / bureau" },
  { value: "autre", label: "Autre" },
];

export function NewVisitDialog({ open, onOpenChange, onSubmit }: NewVisitDialogProps) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [missionType, setMissionType] = useState<MissionType | "">("");
  const [buildingType, setBuildingType] = useState<BuildingType | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) {
      setTitle("");
      setAddress("");
      setMissionType("");
      setBuildingType("");
      setSubmitting(false);
    }
  }, [open]);

  const candidate = {
    title: title.trim(),
    address: address.trim(),
    mission_type: missionType,
    building_type: buildingType,
  };
  const parsed = newVisitSchema.safeParse(candidate);
  const isValid = parsed.success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.success || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Nouvelle visite technique</DialogTitle>
          <DialogDescription className="font-body">
            Renseignez les informations de base. Vous pourrez les compléter pendant la visite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 font-ui">
          <div className="space-y-2">
            <Label htmlFor="vt-title">Titre</Label>
            <Input
              id="vt-title"
              placeholder="Ex : Maison Dupont — Lyon 7e"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vt-address">Adresse</Label>
            <Input
              id="vt-address"
              placeholder="12 rue de la République, 69007 Lyon"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={255}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vt-mission">Type de mission</Label>
            <Select
              value={missionType}
              onValueChange={(v) => setMissionType(v as MissionType)}
            >
              <SelectTrigger id="vt-mission" aria-label="Type de mission">
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {MISSION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vt-building">Typologie de bâtiment</Label>
            <Select
              value={buildingType}
              onValueChange={(v) => setBuildingType(v as BuildingType)}
            >
              <SelectTrigger id="vt-building" aria-label="Typologie de bâtiment">
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {BUILDING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!isValid || submitting}>
              {submitting ? "Création…" : "Créer la visite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
