import {
  Camera,
  FileText,
  Layers,
  MapPin,
  PencilLine,
  Ruler,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StubAction {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STUBS: StubAction[] = [
  { key: "photo", label: "Photo", description: "Capture caméra", icon: Camera },
  { key: "burst", label: "Rafale", description: "Multi-photos", icon: Layers },
  { key: "gallery", label: "Galerie", description: "Choix existant", icon: ImageIcon },
  { key: "file", label: "Fichier", description: "PDF, DWG, etc.", icon: FileText },
  { key: "sketch", label: "Croquis", description: "Annotation main", icon: PencilLine },
  { key: "geo", label: "Géoloc", description: "Position GPS", icon: MapPin },
  { key: "laser", label: "Laser", description: "Mesure Bluetooth", icon: Ruler },
];

/**
 * BottomSheet d'actions d'attachement — Itération 5 = stubs Phase 2.
 * Toutes les actions sont désactivées et déclenchent un toast informatif.
 */
export function AttachmentSheet({ open, onOpenChange }: AttachmentSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="safe-bottom safe-x rounded-t-2xl border-t border-border"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading text-base">
            Ajouter à la visite
          </SheetTitle>
          <SheetDescription className="font-body text-xs text-muted-foreground">
            Photos, audio et croquis arrivent en Phase 2.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-4 gap-3 px-4 py-4">
          {STUBS.map(({ key, label, description, icon: Icon }) => (
            <button
              key={key}
              type="button"
              disabled
              onClick={() =>
                toast.message(label, { description: "Bientôt disponible" })
              }
              className="touch-target flex flex-col items-center gap-1 rounded-xl bg-muted/40 p-2 text-muted-foreground opacity-60"
              aria-label={`${label} — bientôt disponible`}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="font-ui text-[10px] font-medium">{label}</span>
              <span className="sr-only">{description}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
