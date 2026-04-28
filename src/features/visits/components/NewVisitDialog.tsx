import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { MapPin, Loader2, RefreshCw, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type {
  BuildingType,
  MissionType,
  TertiaireSubtype,
} from "@/shared/types";

/**
 * Modal de création de VT.
 *
 * Itération 12 — métadonnées étendues :
 *  - Date & heure auto (timestamp local, lecture seule).
 *  - Géolocalisation auto via navigator.geolocation (asynchrone, optionnelle).
 *  - Mission : audit_energetique, dpe, ppt, dtg, note_dimensionnement, autre
 *  - Bâtiment : maison_individuelle, appartement, copropriete, monopropriete,
 *               industrie, tertiaire, autre
 *  - Champs libres "Précisez" si "autre" est choisi (mission OU bâtiment OU sous-secteur).
 *  - Sous-secteur tertiaire si building === "tertiaire".
 */

const MISSION_OPTIONS: { value: MissionType; label: string }[] = [
  { value: "audit_energetique", label: "Audit énergétique" },
  { value: "dpe", label: "DPE" },
  { value: "ppt", label: "PPT" },
  { value: "dtg", label: "DTG" },
  { value: "note_dimensionnement", label: "Note de dimensionnement" },
  { value: "autre", label: "Autre" },
];

const BUILDING_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: "maison_individuelle", label: "Maison individuelle" },
  { value: "appartement", label: "Appartement" },
  { value: "copropriete", label: "Copropriété" },
  { value: "monopropriete", label: "Monopropriété" },
  { value: "industrie", label: "Industrie" },
  { value: "tertiaire", label: "Tertiaire" },
  { value: "autre", label: "Autre" },
];

const TERTIAIRE_SUBTYPE_OPTIONS: { value: TertiaireSubtype; label: string }[] = [
  { value: "bureau", label: "Bureau" },
  { value: "hotellerie", label: "Hôtellerie" },
  { value: "sante", label: "Santé" },
  { value: "enseignement", label: "Enseignement" },
  { value: "commerce", label: "Commerce" },
  { value: "restauration", label: "Restauration" },
  { value: "autre", label: "Autres secteurs" },
];

const newVisitSchema = z
  .object({
    title: z.string().trim().min(1, "Titre requis").max(120),
    address: z.string().trim().min(1, "Adresse requise").max(255),
    mission_type: z.enum([
      "audit_energetique",
      "dpe",
      "ppt",
      "dtg",
      "note_dimensionnement",
      "autre",
    ]),
    mission_type_other: z.string().trim().max(120).optional(),
    building_type: z.enum([
      "maison_individuelle",
      "appartement",
      "copropriete",
      "monopropriete",
      "industrie",
      "tertiaire",
      "autre",
    ]),
    building_type_other: z.string().trim().max(120).optional(),
    tertiaire_subtype: z
      .enum([
        "bureau",
        "hotellerie",
        "sante",
        "enseignement",
        "commerce",
        "restauration",
        "autre",
      ])
      .optional(),
    tertiaire_subtype_other: z.string().trim().max(120).optional(),
    visit_started_at: z.string(),
    gps: z
      .object({
        lat: z.number(),
        lng: z.number(),
        accuracyM: z.number().nullable(),
      })
      .nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.mission_type === "autre" && !val.mission_type_other) {
      ctx.addIssue({
        code: "custom",
        path: ["mission_type_other"],
        message: "Précisez la mission",
      });
    }
    if (val.building_type === "autre" && !val.building_type_other) {
      ctx.addIssue({
        code: "custom",
        path: ["building_type_other"],
        message: "Précisez le bâtiment",
      });
    }
    if (val.building_type === "tertiaire" && !val.tertiaire_subtype) {
      ctx.addIssue({
        code: "custom",
        path: ["tertiaire_subtype"],
        message: "Sous-secteur requis",
      });
    }
    if (val.tertiaire_subtype === "autre" && !val.tertiaire_subtype_other) {
      ctx.addIssue({
        code: "custom",
        path: ["tertiaire_subtype_other"],
        message: "Précisez le secteur",
      });
    }
  });

export type NewVisitFormValue = z.infer<typeof newVisitSchema>;

interface NewVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: NewVisitFormValue) => Promise<void> | void;
}

type GpsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; lat: number; lng: number; accuracyM: number | null }
  | { status: "denied" }
  | { status: "unavailable"; reason: string };

function formatDateTimeFr(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function NewVisitDialog({
  open,
  onOpenChange,
  onSubmit,
}: NewVisitDialogProps) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [missionType, setMissionType] = useState<MissionType | "">("");
  const [missionTypeOther, setMissionTypeOther] = useState("");
  const [buildingType, setBuildingType] = useState<BuildingType | "">("");
  const [buildingTypeOther, setBuildingTypeOther] = useState("");
  const [tertiaireSubtype, setTertiaireSubtype] = useState<
    TertiaireSubtype | ""
  >("");
  const [tertiaireSubtypeOther, setTertiaireSubtypeOther] = useState("");
  const [startedAt, setStartedAt] = useState<string>(() =>
    new Date().toISOString(),
  );
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);

  // Reset à l'ouverture + capture date/heure + géoloc
  useEffect(() => {
    if (!open) {
      setTitle("");
      setAddress("");
      setMissionType("");
      setMissionTypeOther("");
      setBuildingType("");
      setBuildingTypeOther("");
      setTertiaireSubtype("");
      setTertiaireSubtypeOther("");
      setSubmitting(false);
      setGps({ status: "idle" });
      return;
    }
    setStartedAt(new Date().toISOString());
    requestGeolocation(setGps);
  }, [open]);

  // Reset des champs conditionnels quand le parent change
  useEffect(() => {
    if (missionType !== "autre") setMissionTypeOther("");
  }, [missionType]);
  useEffect(() => {
    if (buildingType !== "autre") setBuildingTypeOther("");
    if (buildingType !== "tertiaire") {
      setTertiaireSubtype("");
      setTertiaireSubtypeOther("");
    }
  }, [buildingType]);
  useEffect(() => {
    if (tertiaireSubtype !== "autre") setTertiaireSubtypeOther("");
  }, [tertiaireSubtype]);

  const candidate = useMemo(
    () => ({
      title: title.trim(),
      address: address.trim(),
      mission_type: missionType || undefined,
      mission_type_other: missionTypeOther.trim() || undefined,
      building_type: buildingType || undefined,
      building_type_other: buildingTypeOther.trim() || undefined,
      tertiaire_subtype: tertiaireSubtype || undefined,
      tertiaire_subtype_other: tertiaireSubtypeOther.trim() || undefined,
      visit_started_at: startedAt,
      gps:
        gps.status === "success"
          ? { lat: gps.lat, lng: gps.lng, accuracyM: gps.accuracyM }
          : null,
    }),
    [
      title,
      address,
      missionType,
      missionTypeOther,
      buildingType,
      buildingTypeOther,
      tertiaireSubtype,
      tertiaireSubtypeOther,
      startedAt,
      gps,
    ],
  );
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
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Nouvelle visite technique
          </DialogTitle>
          <DialogDescription className="font-body">
            Renseignez les informations de base. Vous pourrez les compléter
            pendant la visite.
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

          {/* Date & heure auto */}
          <div className="space-y-2">
            <Label htmlFor="vt-started-at">Date & heure</Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground">
              <Clock
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span id="vt-started-at" data-testid="vt-started-at">
                {formatDateTimeFr(startedAt)}
              </span>
            </div>
          </div>

          {/* Géolocalisation auto */}
          <div className="space-y-2">
            <Label>Position GPS</Label>
            <div
              className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
              data-testid="vt-gps"
            >
              <MapPin
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-foreground">
                <GpsLabel state={gps} />
              </span>
              {gps.status !== "loading" && gps.status !== "success" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => requestGeolocation(setGps)}
                  className="h-7 px-2"
                  aria-label="Réessayer la géolocalisation"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ml-1 text-xs">Réessayer</span>
                </Button>
              ) : null}
              {gps.status === "loading" ? (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>

          {/* Type de mission */}
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

          {missionType === "autre" ? (
            <div className="space-y-2">
              <Label htmlFor="vt-mission-other">Précisez la mission</Label>
              <Input
                id="vt-mission-other"
                placeholder="Décrivez la mission"
                value={missionTypeOther}
                onChange={(e) => setMissionTypeOther(e.target.value)}
                maxLength={120}
              />
            </div>
          ) : null}

          {/* Typologie de bâtiment */}
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

          {buildingType === "autre" ? (
            <div className="space-y-2">
              <Label htmlFor="vt-building-other">Précisez le bâtiment</Label>
              <Input
                id="vt-building-other"
                placeholder="Décrivez le type de bâtiment"
                value={buildingTypeOther}
                onChange={(e) => setBuildingTypeOther(e.target.value)}
                maxLength={120}
              />
            </div>
          ) : null}

          {/* Sous-secteur tertiaire */}
          {buildingType === "tertiaire" ? (
            <div className="space-y-2">
              <Label htmlFor="vt-tertiaire">Sous-secteur tertiaire</Label>
              <Select
                value={tertiaireSubtype}
                onValueChange={(v) =>
                  setTertiaireSubtype(v as TertiaireSubtype)
                }
              >
                <SelectTrigger
                  id="vt-tertiaire"
                  aria-label="Sous-secteur tertiaire"
                >
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {TERTIAIRE_SUBTYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {buildingType === "tertiaire" && tertiaireSubtype === "autre" ? (
            <div className="space-y-2">
              <Label htmlFor="vt-tertiaire-other">Précisez le secteur</Label>
              <Input
                id="vt-tertiaire-other"
                placeholder="Décrivez le secteur d'activité"
                value={tertiaireSubtypeOther}
                onChange={(e) => setTertiaireSubtypeOther(e.target.value)}
                maxLength={120}
              />
            </div>
          ) : null}

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

function GpsLabel({ state }: { state: GpsState }) {
  switch (state.status) {
    case "idle":
      return <span className="text-muted-foreground">En attente…</span>;
    case "loading":
      return (
        <span className="text-muted-foreground">Localisation en cours…</span>
      );
    case "success":
      return (
        <span>
          {state.lat.toFixed(5)}, {state.lng.toFixed(5)}
          {state.accuracyM != null ? (
            <span className="text-muted-foreground">
              {" "}
              (±{Math.round(state.accuracyM)} m)
            </span>
          ) : null}
        </span>
      );
    case "denied":
      return (
        <span className="text-muted-foreground">
          Localisation refusée — facultative
        </span>
      );
    case "unavailable":
      return (
        <span className="text-muted-foreground">
          Indisponible ({state.reason}) — facultative
        </span>
      );
  }
}

function requestGeolocation(setGps: (s: GpsState) => void): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    setGps({ status: "unavailable", reason: "non supporté" });
    return;
  }
  setGps({ status: "loading" });
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setGps({
        status: "success",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : null,
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setGps({ status: "denied" });
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setGps({ status: "unavailable", reason: "position indisponible" });
      } else if (err.code === err.TIMEOUT) {
        setGps({ status: "unavailable", reason: "délai dépassé" });
      } else {
        setGps({ status: "unavailable", reason: "erreur" });
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}
