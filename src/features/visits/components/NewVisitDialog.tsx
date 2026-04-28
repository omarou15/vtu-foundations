import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { MapPin, Loader2, RefreshCw, Clock, Crosshair } from "lucide-react";
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
 * Itération 12bis — corrections géoloc :
 *  - Géoloc déclenchée UNIQUEMENT sur clic utilisateur (geste requis pour
 *    que `getCurrentPosition` fonctionne dans l'iframe preview).
 *  - Watchdog 15s : si aucun callback success/error, on bascule en
 *    "délai dépassé" (cas où l'iframe avale la requête silencieusement).
 *  - Reverse geocoding (Nominatim OSM) → auto-remplit l'adresse si vide.
 *  - Ordre visuel : GPS AVANT adresse (puisqu'il l'alimente).
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

type GeocodeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; address: string }
  | { status: "error" };

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
  const [geocode, setGeocode] = useState<GeocodeState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);

  // Refs pour annuler watchdog & geocoding au démontage / fermeture
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  function clearWatchdog() {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }
  function abortGeocode() {
    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
      geocodeAbortRef.current = null;
    }
  }

  // Reset à l'ouverture / fermeture (pas d'auto-géoloc : geste requis)
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
      setGeocode({ status: "idle" });
      clearWatchdog();
      abortGeocode();
      return;
    }
    setStartedAt(new Date().toISOString());
  }, [open]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      clearWatchdog();
      abortGeocode();
    };
  }, []);

  // Reset des champs conditionnels
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

  /**
   * IMPORTANT : appelé synchroniquement depuis un onClick (geste utilisateur).
   * Ne pas mettre d'await avant `getCurrentPosition` sinon l'iframe bloque.
   */
  function handleLocateClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps({ status: "unavailable", reason: "non supporté" });
      return;
    }
    clearWatchdog();
    abortGeocode();
    setGps({ status: "loading" });
    setGeocode({ status: "idle" });

    let settled = false;
    const finish = (next: GpsState) => {
      if (settled) return;
      settled = true;
      clearWatchdog();
      setGps(next);
      if (next.status === "success") {
        runReverseGeocode(next.lat, next.lng);
      }
    };

    // Watchdog : si rien sous 15s, on déclare un timeout côté JS
    watchdogRef.current = setTimeout(() => {
      finish({ status: "unavailable", reason: "délai dépassé" });
    }, 15000);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          finish({
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
            finish({ status: "denied" });
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            finish({ status: "unavailable", reason: "position indisponible" });
          } else if (err.code === err.TIMEOUT) {
            finish({ status: "unavailable", reason: "délai dépassé" });
          } else {
            finish({ status: "unavailable", reason: "erreur" });
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
      );
    } catch {
      finish({ status: "unavailable", reason: "erreur" });
    }
  }

  /**
   * Reverse geocoding via Nominatim (OpenStreetMap) — pas de clé API.
   * Auto-remplit le champ adresse seulement s'il est vide.
   */
  function runReverseGeocode(lat: number, lng: number) {
    abortGeocode();
    const ctrl = new AbortController();
    geocodeAbortRef.current = ctrl;
    setGeocode({ status: "loading" });

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(
      String(lat),
    )}&lon=${encodeURIComponent(String(lng))}&format=json&accept-language=fr&zoom=18&addressdetails=1`;

    fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((data: { display_name?: string }) => {
        const display = (data?.display_name ?? "").trim();
        if (!display) {
          setGeocode({ status: "error" });
          return;
        }
        setGeocode({ status: "success", address: display });
        // N'écrase pas une adresse déjà saisie manuellement
        if (!addressRef.current.trim()) {
          setAddress(display);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setGeocode({ status: "error" });
      });
  }

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

  const canUseGeoAddress =
    geocode.status === "success" &&
    address.trim() !== "" &&
    address.trim() !== geocode.address.trim();

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
          {/* 1. Titre */}
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

          {/* 2. Date & heure auto */}
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

          {/* 3. Position GPS — AVANT l'adresse (puisqu'elle l'alimente) */}
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
              {gps.status === "loading" ? (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : gps.status === "success" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleLocateClick}
                  className="h-7 px-2"
                  aria-label="Actualiser la position"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ml-1 text-xs">Actualiser</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleLocateClick}
                  className="h-7 px-2"
                  aria-label="Localiser"
                >
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="ml-1 text-xs">
                    {gps.status === "idle" ? "Localiser" : "Réessayer"}
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* 4. Adresse — auto-remplie depuis le GPS si vide */}
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
            {geocode.status === "loading" ? (
              <p className="text-xs text-muted-foreground">
                Recherche de l'adresse à partir du GPS…
              </p>
            ) : null}
            {canUseGeoAddress ? (
              <button
                type="button"
                onClick={() => {
                  if (geocode.status === "success") {
                    setAddress(geocode.address);
                  }
                }}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                Utiliser l'adresse GPS
              </button>
            ) : null}
          </div>

          {/* 5. Type de mission */}
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

          {/* 6. Typologie de bâtiment */}
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
      return (
        <span className="text-muted-foreground">
          Appuyez sur « Localiser »
        </span>
      );
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
