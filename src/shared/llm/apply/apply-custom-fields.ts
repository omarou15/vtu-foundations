/**
 * apply-custom-fields : ajoute les nouveaux champs IA dans la section
 * `custom_fields[]` ciblée. Gate de doublon par `field_key`.
 *
 * Si la section n'a pas de tableau `custom_fields`, on l'ignore (pas
 * toutes les sections en ont — cf. CustomFieldSchema sections.ts).
 */

import type { VisitJsonState } from "@/shared/types";
import type { AiCustomField } from "../types";
import { v4 as uuidv4 } from "uuid";

export interface ApplyCustomFieldsInput {
  state: VisitJsonState;
  customFields: AiCustomField[];
  sourceMessageId: string | null;
  sourceExtractionId: string;
}

export interface ApplyCustomFieldsResult {
  state: VisitJsonState;
  applied: Array<{ section_path: string; field_key: string }>;
  ignored: Array<{
    section_path: string;
    field_key: string;
    reason: string;
  }>;
}

export function applyCustomFields(
  input: ApplyCustomFieldsInput,
): ApplyCustomFieldsResult {
  const next = clone(input.state) as unknown as Record<string, unknown>;
  const applied: ApplyCustomFieldsResult["applied"] = [];
  const ignored: ApplyCustomFieldsResult["ignored"] = [];
  const now = new Date().toISOString();

  for (const cf of input.customFields) {
    const section = next[cf.section_path] as
      | Record<string, unknown>
      | undefined;
    if (!section || typeof section !== "object") {
      ignored.push({
        section_path: cf.section_path,
        field_key: cf.field_key,
        reason: "section_not_found",
      });
      continue;
    }
    const list = section.custom_fields;
    if (!Array.isArray(list)) {
      ignored.push({
        section_path: cf.section_path,
        field_key: cf.field_key,
        reason: "section_no_custom_fields",
      });
      continue;
    }
    const exists = (list as Array<Record<string, unknown>>).some(
      (e) => e.field_key === cf.field_key,
    );
    if (exists) {
      ignored.push({
        section_path: cf.section_path,
        field_key: cf.field_key,
        reason: "duplicate_field_key",
      });
      continue;
    }
    list.push({
      id: uuidv4(),
      field_key: cf.field_key,
      label_fr: cf.label_fr,
      value: cf.value,
      value_type: cf.value_type,
      unit: cf.unit,
      source: "ai_infer",
      confidence: cf.confidence,
      updated_at: now,
      source_message_id: input.sourceMessageId,
      source_extraction_id: input.sourceExtractionId,
      evidence_refs: cf.evidence_refs,
      validation_status: "unvalidated",
      validated_at: null,
      validated_by: null,
    });
    applied.push({ section_path: cf.section_path, field_key: cf.field_key });
  }

  return {
    state: next as unknown as VisitJsonState,
    applied,
    ignored,
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
