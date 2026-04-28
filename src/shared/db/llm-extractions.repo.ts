/**
 * Repository llm_extractions (Dexie local, append-only audit trail).
 *
 * Doctrine It. 10 :
 *  - Une ligne par appel LLM (success | partial | failed | rate_limited | malformed).
 *  - Pas d'UPDATE — append-only.
 *  - Sync vers Supabase via sync_queue (op="insert").
 */

import { v4 as uuidv4 } from "uuid";
import { getDb, type LocalLlmExtraction } from "@/shared/db/schema";
import type {
  LlmExtractionRow,
  LlmMode,
  LlmExtractionStatus,
  SyncQueueEntry,
} from "@/shared/types";

export interface AppendLocalLlmExtractionInput {
  userId: string;
  visitId: string;
  organizationId?: string | null;
  messageId?: string | null;
  attachmentId?: string | null;
  mode: LlmMode;
  provider: string;
  modelVersion: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  confidenceOverall?: number | null;
  contextBundle: Record<string, unknown>;
  rawRequestSummary: Record<string, unknown>;
  stablePromptHash?: string | null;
  providerRequestId?: string | null;
  rawResponse: Record<string, unknown>;
  patchesCount?: number;
  customFieldsCount?: number;
  insertEntriesCount?: number;
  status: LlmExtractionStatus;
  warnings?: string[];
  errorMessage?: string | null;
}

export async function appendLocalLlmExtraction(
  input: AppendLocalLlmExtractionInput,
): Promise<LocalLlmExtraction> {
  const db = getDb();
  const now = new Date().toISOString();
  const row: LlmExtractionRow = {
    id: uuidv4(),
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    visit_id: input.visitId,
    message_id: input.messageId ?? null,
    attachment_id: input.attachmentId ?? null,
    mode: input.mode,
    provider: input.provider,
    model_version: input.modelVersion,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    cached_input_tokens: input.cachedInputTokens ?? null,
    cost_usd: input.costUsd ?? null,
    latency_ms: input.latencyMs ?? null,
    confidence_overall: input.confidenceOverall ?? null,
    context_bundle: input.contextBundle,
    raw_request_summary: input.rawRequestSummary,
    stable_prompt_hash: input.stablePromptHash ?? null,
    provider_request_id: input.providerRequestId ?? null,
    raw_response: input.rawResponse,
    patches_count: input.patchesCount ?? 0,
    custom_fields_count: input.customFieldsCount ?? 0,
    insert_entries_count: input.insertEntriesCount ?? 0,
    status: input.status,
    warnings: input.warnings ?? [],
    error_message: input.errorMessage ?? null,
    created_at: now,
  };

  const local: LocalLlmExtraction = {
    ...row,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    local_updated_at: now,
  };

  const queueEntry: SyncQueueEntry = {
    table: "llm_extractions",
    op: "insert",
    row_id: row.id,
    payload: serializeForSync(row),
    attempts: 0,
    last_error: null,
    created_at: now,
    next_attempt_at: now,
  };

  await db.transaction("rw", db.llm_extractions, db.sync_queue, async () => {
    await db.llm_extractions.add(local);
    await db.sync_queue.add(queueEntry);
  });
  return local;
}

function serializeForSync(r: LlmExtractionRow): Record<string, unknown> {
  return {
    id: r.id,
    user_id: r.user_id,
    organization_id: r.organization_id,
    visit_id: r.visit_id,
    message_id: r.message_id,
    attachment_id: r.attachment_id,
    mode: r.mode,
    provider: r.provider,
    model_version: r.model_version,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cached_input_tokens: r.cached_input_tokens,
    cost_usd: r.cost_usd,
    latency_ms: r.latency_ms,
    confidence_overall: r.confidence_overall,
    context_bundle: r.context_bundle,
    raw_request_summary: r.raw_request_summary,
    stable_prompt_hash: r.stable_prompt_hash,
    provider_request_id: r.provider_request_id,
    raw_response: r.raw_response,
    patches_count: r.patches_count,
    custom_fields_count: r.custom_fields_count,
    insert_entries_count: r.insert_entries_count,
    status: r.status,
    warnings: r.warnings,
    error_message: r.error_message,
    created_at: r.created_at,
  };
}
