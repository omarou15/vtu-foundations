/**
 * VTU — Append d'une entrée dans `state.attachments_log.items`.
 *
 * Doctrine "JSON = Cerveau" : les descriptions IA des photos sont
 * persistées DANS le state versionné pour que le LLM les voie via
 * le `state` du ContextBundle, sans dépendre des `recent_messages`.
 *
 * Pure fonction (pas d'I/O Dexie). Idempotent : si une entrée
 * `attachment_id` existe déjà, on ne la duplique pas (on retourne
 * le state inchangé).
 */

import { v4 as uuidv4 } from "uuid";
import { aiInferField } from "@/shared/types/json-state.field";
import {
  makeEmptyAttachmentsLog,
  type AttachmentLogItem,
} from "@/shared/types/json-state.sections";
import type { VisitJsonState } from "@/shared/types";

export interface AppendAttachmentLogEntryInput {
  state: VisitJsonState;
  attachmentId: string;
  mediaProfile: "photo" | "plan" | "pdf" | null;
  shortCaption: string | null;
  detailedDescription: string | null;
  ocrText: string | null;
  parentMessageId: string | null;
  sourceMessageId: string | null;
  sourceExtractionId: string;
  /** Confiance globale issue de describeMedia (0..1) → bucket low/medium/high. */
  confidenceOverall?: number | null;
  /** Date ISO de capture (par défaut now). */
  capturedAt?: string;
}

export interface AppendAttachmentLogEntryResult {
  state: VisitJsonState;
  appended: boolean;
  reason?: "already_exists";
}

export function appendAttachmentLogEntry(
  input: AppendAttachmentLogEntryInput,
): AppendAttachmentLogEntryResult {
  const next = clone(input.state) as unknown as Record<string, unknown>;

  // Auto-vivify la section si absente (state v2 pré-migration).
  let log = next.attachments_log as
    | { items?: AttachmentLogItem[] }
    | undefined;
  if (!log || typeof log !== "object") {
    log = makeEmptyAttachmentsLog();
    next.attachments_log = log;
  }
  if (!Array.isArray(log.items)) {
    log.items = [];
  }

  // Idempotence : pas de re-append si attachment_id déjà présent.
  if (log.items.some((it) => it?.attachment_id === input.attachmentId)) {
    return {
      state: next as unknown as VisitJsonState,
      appended: false,
      reason: "already_exists",
    };
  }

  const evidenceRefs = [input.attachmentId];
  if (input.parentMessageId) evidenceRefs.push(input.parentMessageId);
  const confidence = bucketConfidence(input.confidenceOverall ?? null);
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const item: AttachmentLogItem = {
    id: uuidv4(),
    attachment_id: input.attachmentId,
    media_profile: input.mediaProfile,
    short_caption: aiInferField({
      value: input.shortCaption ?? "",
      confidence,
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs,
    }),
    detailed_description: aiInferField({
      value: input.detailedDescription ?? "",
      confidence,
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs,
    }),
    ocr_text: aiInferField({
      value: input.ocrText ?? "",
      confidence,
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs,
    }),
    parent_message_id: input.parentMessageId,
    captured_at: aiInferField({
      value: capturedAt,
      confidence: "high",
      sourceMessageId: input.sourceMessageId,
      sourceExtractionId: input.sourceExtractionId,
      evidenceRefs,
    }),
  };

  log.items.push(item);
  return {
    state: next as unknown as VisitJsonState,
    appended: true,
  };
}

function bucketConfidence(c: number | null): "low" | "medium" | "high" {
  if (c == null) return "medium";
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
