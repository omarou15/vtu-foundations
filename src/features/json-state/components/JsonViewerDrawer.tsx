import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { JsonView, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { Copy, Check, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getLatestLocalJsonState } from "@/shared/db";
import { countLowConfidenceFields } from "../lib/inspect";

interface JsonViewerDrawerProps {
  visitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Drawer JSON viewer — KNOWLEDGE §2 (JSON = source de vérité).
 *
 * - Lecture live de la dernière version locale via Dexie.
 * - Highlight orange (warning) du nombre de Field<T> à confidence "low".
 * - Bouton "Copier JSON" → navigator.clipboard.
 * - Layout : Sheet `side="right"` — sur mobile le SheetContent prend
 *   `w-full` (plein écran), sur desktop il s'arrête à `sm:max-w-lg`
 *   (panneau latéral). Le contenu reste scrollable, header sticky.
 */
export function JsonViewerDrawer({ visitId, open, onOpenChange }: JsonViewerDrawerProps) {
  const latest = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const lowCount = useMemo(
    () => (latest ? countLowConfidenceFields(latest.state) : 0),
    [latest],
  );

  async function handleCopy() {
    if (!latest) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(latest.state, null, 2));
      setCopied(true);
      toast.success("JSON copié", {
        description: `Version ${latest.version}`,
      });
    } catch {
      toast.error("Impossible de copier le JSON");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className="safe-top safe-bottom safe-x flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-heading text-base">
                {latest
                  ? `JSON state v${latest.version}`
                  : "État JSON"}
              </SheetTitle>
              <SheetDescription className="font-body text-xs text-muted-foreground">
                Source de vérité — versionné, append-only.
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={!latest}
              className="font-ui shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copié
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copier JSON
                </>
              )}
            </Button>
          </div>

          {lowCount > 0 ? (
            <div
              className="font-ui mt-2 inline-flex items-center gap-1.5 self-start rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning"
              role="status"
              data-testid="low-confidence-badge"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {lowCount} champ{lowCount > 1 ? "s" : ""} à vérifier
            </div>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs">
          {!latest ? (
            <p className="font-body text-sm text-muted-foreground">
              État pas encore chargé (synchro en cours).
            </p>
          ) : (
            <div data-testid="json-viewer-tree">
              <JsonView
                data={latest.state as unknown as object}
                style={defaultStyles}
                shouldExpandNode={(level) => level < 2}
                clickToExpandNode
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
