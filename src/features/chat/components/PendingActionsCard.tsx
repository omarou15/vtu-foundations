/**
 * VTU — PendingActionsCard (Lot A).
 *
 * Card inline qui regroupe TOUTES les propositions IA d'un même message
 * d'extract. 3 sous-cartes :
 *  1. Patches Field<T> (set_field) — ligne ✓/✗ par patch.
 *  2. Insert entries (nouvelle entrée de collection) — section repliable
 *     par entrée avec ✓/✗.
 *  3. Custom fields (vocabulaire émergent) — ligne ✓/✗ par champ.
 *
 * Boutons "Tout valider" et "Tout refuser" en haut quand il reste >1
 * proposition active.
 *
 * Source de vérité du statut : le state JSON courant (live query).
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, X, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { LocalMessage } from "@/shared/db";
import {
  rejectCustomField,
  rejectFieldPatch,
  rejectInsertEntry,
  validateCustomField,
  validateFieldPatch,
  validateInsertEntry,
} from "@/shared/db/json-state.validate.repo";
import { getLatestLocalJsonState } from "@/shared/db/json-state.repo";
import {
  formatPatchValue,
  labelForPath,
  labelForSection,
} from "@/shared/llm/path-labels";
import { walkJsonPath } from "@/shared/llm/apply/path-utils";
import type { AiFieldPatch, AiCustomField, AiInsertEntry } from "@/shared/llm";
import type { Field } from "@/shared/types/json-state.field";

interface PendingActionsCardProps {
  message: LocalMessage;
  userId: string;
  visitId: string;
}

interface PatchRow {
  path: string;
  label: string;
  value: string;
  confidence: "low" | "medium" | "high";
  status: "unvalidated" | "validated" | "rejected" | "missing";
}

interface AppliedInsert {
  collection: string;
  entry_id: string;
  fields_set: string[];
}

interface InsertRow {
  collection: string;
  entryId: string;
  fieldsSet: string[];
  /** Snapshot des Field<T> de l'entrée pour affichage. */
  values: Array<{ key: string; label: string; value: string }>;
  status: "pending" | "validated" | "rejected" | "missing";
  confidence: "low" | "medium" | "high";
}

interface CustomFieldRow {
  sectionPath: string;
  fieldKey: string;
  labelFr: string;
  value: string;
  confidence: "low" | "medium" | "high";
  status: "pending" | "validated" | "rejected" | "missing";
}

export function PendingActionsCard({
  message,
  userId,
  visitId,
}: PendingActionsCardProps) {
  const meta = (message.metadata ?? {}) as {
    proposed_patches?: AiFieldPatch[];
    proposed_insert_entries?: AiInsertEntry[];
    proposed_custom_fields?: AiCustomField[];
    applied_inserts?: AppliedInsert[];
    rejected_inserts?: Array<{ collection: string; entry_id: string }>;
    rejected_custom_fields?: Array<{ section_path: string; field_key: string }>;
  };
  const proposedPatches = meta.proposed_patches ?? [];
  const proposedCustom = meta.proposed_custom_fields ?? [];
  const proposedInserts = meta.proposed_insert_entries ?? [];
  const appliedInserts = meta.applied_inserts ?? [];
  const rejectedInserts = meta.rejected_inserts ?? [];
  const rejectedCustom = meta.rejected_custom_fields ?? [];

  const latestState = useLiveQuery(
    () => getLatestLocalJsonState(visitId),
    [visitId],
    undefined,
  );

  // ----- Patches -----
  const patchRows: PatchRow[] = useMemo(() => {
    if (!latestState) {
      return proposedPatches.map((p) => ({
        path: p.path,
        label: labelForPath(p.path),
        value: formatPatchValue(p.value),
        confidence: p.confidence,
        status: "unvalidated" as const,
      }));
    }
    return proposedPatches.map((p) => {
      const cur = readField(latestState.state, p.path);
      const status: PatchRow["status"] = !cur ? "missing" : cur.validation_status;
      return {
        path: p.path,
        label: labelForPath(p.path),
        value: formatPatchValue(cur?.value ?? p.value),
        confidence: p.confidence,
        status,
      };
    });
  }, [latestState, proposedPatches]);

  // ----- Insert entries -----
  const insertRows: InsertRow[] = useMemo(() => {
    return appliedInserts.map((ai) => {
      const original = proposedInserts.find(
        (p) => p.collection === ai.collection,
      );
      const confidence = original?.confidence ?? "medium";
      const wasRejectedClient = rejectedInserts.some(
        (r) => r.collection === ai.collection && r.entry_id === ai.entry_id,
      );
      const entry = latestState
        ? findEntryInState(latestState.state, ai.collection, ai.entry_id)
        : null;
      let status: InsertRow["status"];
      if (wasRejectedClient || (latestState && !entry)) {
        status = wasRejectedClient ? "rejected" : "missing";
      } else if (entry) {
        const fields = entryFieldRows(entry, ai.fields_set);
        const allValidated =
          fields.length > 0 &&
          fields.every((f) => f.validationStatus === "validated");
        status = allValidated ? "validated" : "pending";
      } else {
        status = "pending";
      }
      const values = entry
        ? entryFieldRows(entry, ai.fields_set).map((f) => ({
            key: f.key,
            label: labelForLeafKey(f.key),
            value: formatPatchValue(f.value),
          }))
        : ai.fields_set.map((k) => ({
            key: k,
            label: labelForLeafKey(k),
            value: "—",
          }));
      return {
        collection: ai.collection,
        entryId: ai.entry_id,
        fieldsSet: ai.fields_set,
        values,
        status,
        confidence,
      };
    });
  }, [appliedInserts, proposedInserts, rejectedInserts, latestState]);

  // ----- Custom fields -----
  const customRows: CustomFieldRow[] = useMemo(() => {
    return proposedCustom.map((cf) => {
      const wasRejectedClient = rejectedCustom.some(
        (r) => r.section_path === cf.section_path && r.field_key === cf.field_key,
      );
      const cfState = latestState
        ? findCustomFieldInState(latestState.state, cf.section_path, cf.field_key)
        : null;
      let status: CustomFieldRow["status"];
      if (wasRejectedClient || (latestState && !cfState)) {
        status = wasRejectedClient ? "rejected" : "missing";
      } else if (cfState) {
        status =
          (cfState as { validation_status?: string }).validation_status ===
          "validated"
            ? "validated"
            : "pending";
      } else {
        status = "pending";
      }
      return {
        sectionPath: cf.section_path,
        fieldKey: cf.field_key,
        labelFr: cf.label_fr,
        value: formatPatchValue(cf.value),
        confidence: cf.confidence,
        status,
      };
    });
  }, [proposedCustom, rejectedCustom, latestState]);

  const pendingPatches = patchRows.filter((r) => r.status === "unvalidated").length;
  const pendingInserts = insertRows.filter((r) => r.status === "pending").length;
  const pendingCustom = customRows.filter((r) => r.status === "pending").length;
  const totalPending = pendingPatches + pendingInserts + pendingCustom;

  return (
    <li className="flex justify-start">
      <div className="bg-card text-card-foreground border border-border max-w-[92%] rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-3.5 py-2.5">
          <div className="flex items-start gap-2">
            <span className="bg-primary/10 text-primary mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className="font-body whitespace-pre-wrap break-words text-sm">
              {message.content || "Voici ce que je propose :"}
            </p>
          </div>
        </div>

        {/* Bandeau global Tout valider / Tout refuser */}
        {totalPending > 1 ? (
          <div className="border-border flex items-center justify-between border-t px-3 py-1.5">
            <span className="font-ui text-muted-foreground text-[11px]">
              {totalPending} proposition{totalPending > 1 ? "s" : ""} en attente
            </span>
            <div className="flex items-center gap-1">
              <RejectAllButton
                userId={userId}
                visitId={visitId}
                messageId={message.id}
                patches={patchRows}
                inserts={insertRows}
                customs={customRows}
              />
              <ApplyAllButton
                userId={userId}
                visitId={visitId}
                messageId={message.id}
                patches={patchRows}
                inserts={insertRows}
                customs={customRows}
              />
            </div>
          </div>
        ) : null}

        {/* Patches */}
        {patchRows.length > 0 ? (
          <div className="border-border border-t">
            <SectionHeader title="Champs" count={pendingPatches} />
            <ul className="divide-border divide-y">
              {patchRows.map((row) => (
                <PatchRowItem
                  key={row.path}
                  row={row}
                  userId={userId}
                  visitId={visitId}
                  messageId={message.id}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {/* Insert entries */}
        {insertRows.length > 0 ? (
          <div className="border-border border-t">
            <SectionHeader title="Nouvelles entrées" count={pendingInserts} />
            <ul className="divide-border divide-y">
              {insertRows.map((row) => (
                <InsertRowItem
                  key={`${row.collection}:${row.entryId}`}
                  row={row}
                  userId={userId}
                  visitId={visitId}
                  messageId={message.id}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {/* Custom fields */}
        {customRows.length > 0 ? (
          <div className="border-border border-t">
            <SectionHeader title="Champs personnalisés" count={pendingCustom} />
            <ul className="divide-border divide-y">
              {customRows.map((row) => (
                <CustomFieldRowItem
                  key={`${row.sectionPath}:${row.fieldKey}`}
                  row={row}
                  userId={userId}
                  visitId={visitId}
                  messageId={message.id}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="bg-muted/30 px-3 py-1.5">
      <p className="font-ui text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
        {title}
        {count > 0 ? ` · ${count} en attente` : ""}
      </p>
    </div>
  );
}

function PatchRowItem({
  row,
  userId,
  visitId,
  messageId,
}: {
  row: PatchRow;
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const isValidated = row.status === "validated";
  const isRejected = row.status === "rejected";
  const isMissing = row.status === "missing";
  const isPending = row.status === "unvalidated";
  const isClickable = isPending || isMissing;

  const onApply = async () => {
    if (busy || !isClickable) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-apply", {
      type: "patch",
      path: row.path,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      if (isMissing) {
        toast.error("Validation impossible", {
          description: `${labelHint(row.path)} — champ absent du JSON state`,
        });
        return;
      }
      const r = await validateFieldPatch({
        userId,
        visitId,
        path: row.path,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "patch",
        path: row.path,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop" && r.reason !== "already_validated") {
        toast.error("Validation impossible", {
          description: `${labelHint(row.path)} — ${r.reason}`,
        });
      }
    } catch (err) {
      toast.error("Validation échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onIgnore = async () => {
    if (busy || !isClickable) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-ignore", {
      type: "patch",
      path: row.path,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      if (isMissing) {
        toast.error("Rejet impossible", {
          description: `${labelHint(row.path)} — champ absent du JSON state`,
        });
        return;
      }
      const r = await rejectFieldPatch({
        userId,
        visitId,
        path: row.path,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "patch",
        path: row.path,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop" && r.reason !== "already_rejected") {
        toast.error("Rejet impossible", {
          description: `${labelHint(row.path)} — ${r.reason}`,
        });
      }
    } catch (err) {
      toast.error("Rejet échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-foreground truncate text-[12px] font-medium">
          {row.label}
        </p>
        <p
          className={[
            "font-body truncate text-[13px]",
            isRejected ? "text-muted-foreground line-through" : "text-foreground",
          ].join(" ")}
        >
          {row.value}
          <ConfidenceBadge confidence={row.confidence} />
        </p>
      </div>
      <ActionButtons
        status={
          isValidated ? "validated" : isRejected ? "rejected" : "pending"
        }
        busy={busy}
        onApply={onApply}
        onIgnore={onIgnore}
        label={row.label}
      />
    </li>
  );
}

function InsertRowItem({
  row,
  userId,
  visitId,
  messageId,
}: {
  row: InsertRow;
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  const isValidated = row.status === "validated";
  const isRejected = row.status === "rejected" || row.status === "missing";
  const isPending = row.status === "pending";

  const onApply = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-apply", {
      type: "insert",
      collection: row.collection,
      entry_id: row.entryId,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      const r = await validateInsertEntry({
        userId,
        visitId,
        collection: row.collection,
        entryId: row.entryId,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "insert",
        collection: row.collection,
        entry_id: row.entryId,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop" && r.reason !== "nothing_to_validate") {
        toast.error("Validation impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Validation échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onIgnore = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-ignore", {
      type: "insert",
      collection: row.collection,
      entry_id: row.entryId,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      const r = await rejectInsertEntry({
        userId,
        visitId,
        collection: row.collection,
        entryId: row.entryId,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "insert",
        collection: row.collection,
        entry_id: row.entryId,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop") {
        toast.error("Rejet impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Rejet échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const sectionLabel = labelForSection(row.collection);

  return (
    <li className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <p className="font-ui text-foreground flex items-center gap-1 text-[12px] font-medium">
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{sectionLabel} · nouvelle entrée</span>
            <ConfidenceBadge confidence={row.confidence} />
          </p>
        </button>
        <ActionButtons
          status={isValidated ? "validated" : isRejected ? "rejected" : "pending"}
          busy={busy}
          onApply={onApply}
          onIgnore={onIgnore}
          label={`entrée ${sectionLabel}`}
        />
      </div>
      {open ? (
        row.values.length > 0 ? (
          <ul className="mt-1.5 ml-4 space-y-0.5">
            {row.values.map((v) => (
              <li key={v.key} className="font-body text-foreground text-[12px]">
                <span className="text-muted-foreground">{v.label} :</span>{" "}
                <span
                  className={isRejected ? "line-through opacity-60" : ""}
                >
                  {v.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-muted-foreground mt-1.5 ml-4 text-[12px] italic">
            Entrée créée sans champ détecté — l'IA n'a rien réussi à structurer.
            Tu peux la rejeter ou la garder vide.
          </p>
        )
      ) : null}
    </li>
  );
}

function CustomFieldRowItem({
  row,
  userId,
  visitId,
  messageId,
}: {
  row: CustomFieldRow;
  userId: string;
  visitId: string;
  messageId: string;
}) {
  const [busy, setBusy] = useState(false);
  const isValidated = row.status === "validated";
  const isRejected = row.status === "rejected" || row.status === "missing";
  const isPending = row.status === "pending";

  const onApply = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-apply", {
      type: "custom_field",
      section_path: row.sectionPath,
      field_key: row.fieldKey,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      const r = await validateCustomField({
        userId,
        visitId,
        sectionPath: row.sectionPath,
        fieldKey: row.fieldKey,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "custom_field",
        section_path: row.sectionPath,
        field_key: row.fieldKey,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop" && r.reason !== "already_validated") {
        toast.error("Validation impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Validation échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onIgnore = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    // eslint-disable-next-line no-console
    console.info("[VTU-DIAG] card-click-ignore", {
      type: "custom_field",
      section_path: row.sectionPath,
      field_key: row.fieldKey,
      visit_id: visitId,
      message_id: messageId,
    });
    try {
      const r = await rejectCustomField({
        userId,
        visitId,
        sectionPath: row.sectionPath,
        fieldKey: row.fieldKey,
        sourceMessageId: messageId,
      });
      // eslint-disable-next-line no-console
      console.info("[VTU-DIAG] card-click-result", {
        type: "custom_field",
        section_path: row.sectionPath,
        field_key: row.fieldKey,
        result_status: r.status,
        result_reason: r.status === "noop" ? r.reason : null,
      });
      if (r.status === "noop") {
        toast.error("Rejet impossible", { description: r.reason });
      }
    } catch (err) {
      toast.error("Rejet échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-foreground truncate text-[12px] font-medium">
          {labelForSection(row.sectionPath)} · {row.labelFr}
        </p>
        <p
          className={[
            "font-body truncate text-[13px]",
            isRejected ? "text-muted-foreground line-through" : "text-foreground",
          ].join(" ")}
        >
          {row.value}
          <ConfidenceBadge confidence={row.confidence} />
        </p>
      </div>
      <ActionButtons
        status={isValidated ? "validated" : isRejected ? "rejected" : "pending"}
        busy={busy}
        onApply={onApply}
        onIgnore={onIgnore}
        label={row.labelFr}
      />
    </li>
  );
}

function ActionButtons({
  status,
  busy,
  onApply,
  onIgnore,
  label,
}: {
  status: "pending" | "validated" | "rejected";
  busy: boolean;
  onApply: () => void;
  onIgnore: () => void;
  label: string;
}) {
  if (status === "validated") {
    return (
      <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium">
        <Check className="h-3 w-3" aria-hidden="true" />
        Validé
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium">
        <X className="h-3 w-3" aria-hidden="true" />
        Ignoré
      </span>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onIgnore}
        disabled={busy}
        aria-label={`Ignorer ${label}`}
        className="border-border text-muted-foreground hover:bg-muted active:bg-muted inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[11px] font-medium transition disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={busy}
        aria-label={`Valider ${label}`}
        className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[11px] font-medium shadow-sm transition disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "low" | "medium" | "high";
}) {
  const labels = { low: "·", medium: "··", high: "···" } as const;
  return (
    <span
      className="text-muted-foreground ml-1.5 text-[10px] tracking-wider"
      aria-label={`Confiance ${confidence}`}
      title={`Confiance ${confidence}`}
    >
      {labels[confidence]}
    </span>
  );
}

function ApplyAllButton({
  userId,
  visitId,
  messageId,
  patches,
  inserts,
  customs,
}: {
  userId: string;
  visitId: string;
  messageId: string;
  patches: PatchRow[];
  inserts: InsertRow[];
  customs: CustomFieldRow[];
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Séquentiel — chaque action crée une nouvelle version JSON state.
      for (const row of patches) {
        if (row.status !== "unvalidated") continue;
        await validateFieldPatch({
          userId,
          visitId,
          path: row.path,
          sourceMessageId: messageId,
        });
      }
      for (const row of inserts) {
        if (row.status !== "pending") continue;
        await validateInsertEntry({
          userId,
          visitId,
          collection: row.collection,
          entryId: row.entryId,
          sourceMessageId: messageId,
        });
      }
      for (const row of customs) {
        if (row.status !== "pending") continue;
        await validateCustomField({
          userId,
          visitId,
          sectionPath: row.sectionPath,
          fieldKey: row.fieldKey,
          sourceMessageId: messageId,
        });
      }
    } catch (err) {
      toast.error("Validation groupée échouée", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-primary hover:bg-primary/10 active:bg-primary/15 font-ui inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50"
    >
      <Check className="h-3 w-3" aria-hidden="true" />
      Tout valider
    </button>
  );
}

function RejectAllButton({
  userId,
  visitId,
  messageId,
  patches,
  inserts,
  customs,
}: {
  userId: string;
  visitId: string;
  messageId: string;
  patches: PatchRow[];
  inserts: InsertRow[];
  customs: CustomFieldRow[];
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const row of patches) {
        if (row.status !== "unvalidated") continue;
        await rejectFieldPatch({
          userId,
          visitId,
          path: row.path,
          sourceMessageId: messageId,
        });
      }
      for (const row of inserts) {
        if (row.status !== "pending") continue;
        await rejectInsertEntry({
          userId,
          visitId,
          collection: row.collection,
          entryId: row.entryId,
          sourceMessageId: messageId,
        });
      }
      for (const row of customs) {
        if (row.status !== "pending") continue;
        await rejectCustomField({
          userId,
          visitId,
          sectionPath: row.sectionPath,
          fieldKey: row.fieldKey,
          sourceMessageId: messageId,
        });
      }
    } catch (err) {
      toast.error("Rejet groupé échoué", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-muted-foreground hover:bg-muted active:bg-muted/80 font-ui inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50"
    >
      <X className="h-3 w-3" aria-hidden="true" />
      Tout refuser
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers state -> UI
// ---------------------------------------------------------------------------

function labelHint(path: string): string {
  try {
    return labelForPath(path);
  } catch {
    return path;
  }
}

function readField(state: unknown, path: string): Field<unknown> | null {
  if (!state || typeof state !== "object") return null;
  const { parent, key } = walkJsonPath(state as Record<string, unknown>, path);
  if (!parent || !key) return null;
  const leaf = parent[key];
  if (!leaf || typeof leaf !== "object" || !("value" in (leaf as object))) {
    return null;
  }
  return leaf as Field<unknown>;
}

function findEntryInState(
  state: unknown,
  collection: string,
  entryId: string,
): Record<string, unknown> | null {
  if (!state || typeof state !== "object") return null;
  const segs = collection.split(".");
  let cur: unknown = state;
  for (const s of segs) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[s];
  }
  if (!Array.isArray(cur)) return null;
  const found = (cur as Array<Record<string, unknown>>).find(
    (e) => e?.id === entryId,
  );
  return found ?? null;
}

interface EntryFieldRow {
  key: string;
  value: unknown;
  validationStatus: string;
}

function entryFieldRows(
  entry: Record<string, unknown>,
  fieldsSet: string[],
): EntryFieldRow[] {
  const out: EntryFieldRow[] = [];
  for (const k of fieldsSet) {
    const f = entry[k];
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    if (!("value" in obj)) continue;
    out.push({
      key: k,
      value: obj.value,
      validationStatus: String(obj.validation_status ?? "unvalidated"),
    });
  }
  return out;
}

function findCustomFieldInState(
  state: unknown,
  sectionPath: string,
  fieldKey: string,
): Record<string, unknown> | null {
  if (!state || typeof state !== "object") return null;
  const segs = sectionPath.split(".");
  let cur: unknown = state;
  for (const s of segs) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[s];
  }
  if (!cur || typeof cur !== "object") return null;
  const list = (cur as Record<string, unknown>).custom_fields;
  if (!Array.isArray(list)) return null;
  const found = (list as Array<Record<string, unknown>>).find(
    (f) => f.field_key === fieldKey,
  );
  return found ?? null;
}

function labelForLeafKey(key: string): string {
  // Réutilise labelForPath en simulant un path 2-segments.
  return labelForPath(`item.${key}`).split(" · ").slice(-1)[0] ?? key;
}
