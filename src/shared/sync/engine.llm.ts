/**
 * VTU — Engine LLM handlers (It. 10).
 *
 * Sépare la logique LLM (describe_media + llm_route_and_dispatch) du
 * fichier engine.ts core pour préserver sa lisibilité.
 *
 * Importé depuis engine.ts via processEntry switch.
 */

import { getDb } from "@/shared/db/schema";
import type { SyncQueueEntry, MessageRow, VisitRow } from "@/shared/types";
import { appendLocalLlmExtraction } from "@/shared/db/llm-extractions.repo";
import {
  appendLocalAttachmentAiDescription,
  getLatestAiDescriptionForAttachment,
} from "@/shared/db/attachment-ai-descriptions.repo";
import { appendLocalMessage } from "@/shared/db/messages.repo";
import {
  appendJsonStateVersion,
  getLatestLocalJsonState,
} from "@/shared/db/json-state.repo";
import {
  applyCustomFields,
  applyPatches,
  buildContextBundle,
  compressContextBundle,
  routeMessage,
  type ContextBundle,
  type DescribeMediaResult,
  type ProviderMeta,
} from "@/shared/llm";
import { describeMedia } from "@/server/llm.functions";
import {
  callVtuLlmAgent,
  type CallVtuLlmAgentResponse,
} from "@/shared/llm/providers/edge-function-client";

// ---------------------------------------------------------------------------
// Types contract avec engine.ts core
// ---------------------------------------------------------------------------

export type ProcessResult = "ok" | "failed" | "retry-later";

export interface EngineHelpers {
  markLocalRowSynced: (entry: SyncQueueEntry) => Promise<void>;
  markLocalRowFailed: (entry: SyncQueueEntry, message: string) => Promise<void>;
  scheduleDependencyWait: (
    entry: SyncQueueEntry,
    reason: string,
  ) => Promise<ProcessResult>;
  scheduleRetryOrFail: (
    entry: SyncQueueEntry,
    err: unknown,
  ) => Promise<ProcessResult>;
}

/**
 * Sous-ensemble Storage utilisé pour générer une URL signée vers le
 * blob compressé d'un attachment.
 */
export interface SyncSupabaseStorageWithSignedUrl {
  from(bucket: string): {
    createSignedUrl?(
      path: string,
      expiresIn: number,
    ): PromiseLike<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }>;
  };
}

export interface SyncSupabaseLikeForLlm {
  storage?: SyncSupabaseStorageWithSignedUrl;
}

const SIGNED_URL_TTL_S = 60;

// ---------------------------------------------------------------------------
// processDescribeMedia
// ---------------------------------------------------------------------------

export async function processDescribeMedia(
  supabase: SyncSupabaseLikeForLlm,
  entry: SyncQueueEntry,
  helpers: EngineHelpers,
): Promise<ProcessResult> {
  const db = getDb();
  const attachment = await db.attachments.get(entry.row_id);
  if (!attachment) {
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }

  // 1. PDF → skipped immédiat (Phase 2 doctrine)
  if (attachment.media_profile === "pdf") {
    const existing = await getLatestAiDescriptionForAttachment(attachment.id);
    if (!existing) {
      await appendLocalAttachmentAiDescription({
        userId: attachment.user_id,
        visitId: attachment.visit_id,
        attachmentId: attachment.id,
        provider: "lovable_gemini",
        modelVersion: "skipped",
        confidenceOverall: 0,
        description: {
          skipped: true,
          reason: "pdf_no_render_phase2",
          short_caption: "Document PDF — analyse différée Phase 2.5",
          detailed_description: null,
          structured_observations: [],
          ocr_text: null,
        },
      });
    }
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    await wakeUpPendingDispatchJobs(attachment.message_id);
    return "ok";
  }

  // 2. Idempotence
  const already = await getLatestAiDescriptionForAttachment(attachment.id);
  if (already) {
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    await wakeUpPendingDispatchJobs(attachment.message_id);
    return "ok";
  }

  // 3. Source image : blob local prioritaire (plus fiable que les URL signées
  // pour l'AI Gateway), URL signée seulement en fallback cross-device.
  const localBlob = await db.attachment_blobs.get(attachment.id);
  let imageDataUrl: string | null = null;
  if (localBlob?.compressed) {
    imageDataUrl = await blobToDataUrl(localBlob.compressed);
  }

  if (!imageDataUrl && attachment.sync_status !== "synced") {
    return await helpers.scheduleDependencyWait(entry, "attachment_not_uploaded");
  }
  if (!imageDataUrl && !attachment.compressed_path) {
    await helpers.markLocalRowFailed(entry, "missing_compressed_path");
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "failed";
  }

  // 4. URL signée fallback
  let signedUrl: string | null = null;
  try {
    const bucketApi = imageDataUrl ? null : supabase.storage?.from(attachment.bucket);
    if (!imageDataUrl && !bucketApi?.createSignedUrl) {
      return await helpers.scheduleRetryOrFail(
        entry,
        new Error("storage.createSignedUrl unavailable"),
      );
    }
    if (!imageDataUrl && bucketApi?.createSignedUrl && attachment.compressed_path) {
    const { data, error } = await bucketApi.createSignedUrl(
      attachment.compressed_path,
      SIGNED_URL_TTL_S,
    );
    if (error || !data?.signedUrl) {
      return await helpers.scheduleRetryOrFail(
        entry,
        new Error(error?.message ?? "no signed url"),
      );
    }
    signedUrl = data.signedUrl;
    }
  } catch (err) {
    return await helpers.scheduleRetryOrFail(entry, err);
  }

  // 5. Appel server function describeMedia
  const profile = (attachment.media_profile ?? "photo") as
    | "photo"
    | "plan"
    | "pdf";
  let resp: Awaited<ReturnType<typeof describeMedia>>;
  try {
    resp = await describeMedia({
      data: {
        imageUrl: signedUrl ?? undefined,
        imageDataUrl: imageDataUrl ?? undefined,
        mediaProfile: profile,
        mimeType: attachment.format,
      },
    });
  } catch (err) {
    return await helpers.scheduleRetryOrFail(entry, err);
  }

  if (!resp.ok) {
    return await handleLlmError(
      resp,
      entry,
      helpers,
      {
        userId: attachment.user_id,
        visitId: attachment.visit_id,
        attachmentId: attachment.id,
        mode: "describe_media",
      },
    );
  }

  // 6. Persistance
  let result: DescribeMediaResult;
  let raw: Record<string, unknown>;
  try {
    result = JSON.parse(resp.result_json) as DescribeMediaResult;
    raw = JSON.parse(resp.raw_response_json) as Record<string, unknown>;
  } catch (err) {
    return await helpers.scheduleRetryOrFail(entry, err);
  }

  await appendLocalAttachmentAiDescription({
    userId: attachment.user_id,
    visitId: attachment.visit_id,
    attachmentId: attachment.id,
    provider: resp.meta.provider,
    modelVersion: resp.meta.model_version,
    confidenceOverall: result.confidence_overall,
    description: {
      short_caption: result.short_caption,
      detailed_description: result.detailed_description,
      structured_observations: result.structured_observations,
      ocr_text: result.ocr_text,
    },
  });

  await appendLocalLlmExtraction({
    userId: attachment.user_id,
    visitId: attachment.visit_id,
    attachmentId: attachment.id,
    messageId: attachment.message_id,
    mode: "describe_media",
    provider: resp.meta.provider,
    modelVersion: resp.meta.model_version,
    inputTokens: resp.meta.input_tokens,
    outputTokens: resp.meta.output_tokens,
    cachedInputTokens: resp.meta.cached_input_tokens,
    latencyMs: resp.meta.latency_ms,
    confidenceOverall: result.confidence_overall,
    contextBundle: {
      mode: "describe_media",
      attachment_ids: [attachment.id],
      media_profile: profile,
    },
    rawRequestSummary: {
      mode: "describe_media",
      model: resp.meta.model_version,
      schema_version: 1,
    },
    stablePromptHash: resp.stable_prompt_hash,
    providerRequestId: resp.meta.provider_request_id,
    rawResponse: raw,
    status: "success",
    warnings: result.warnings,
  });

  // It. 14 — Streaming photo-par-photo : si la photo appartient à un batch
  // (≥ 2 attachments sur le même message), on émet immédiatement une bulle
  // assistant `photo_caption` pour donner un signal visible de progression.
  // Idempotent via metadata.attachment_id (anti-doublon).
  await maybeEmitPhotoCaption({
    attachment,
    shortCaption: result.short_caption,
  });

  await helpers.markLocalRowSynced(entry);
  if (entry.id != null) await db.sync_queue.delete(entry.id);

  await wakeUpPendingDispatchJobs(attachment.message_id);
  return "ok";
}

// ---------------------------------------------------------------------------
// processLlmRouteAndDispatch
// ---------------------------------------------------------------------------

export async function processLlmRouteAndDispatch(
  _supabase: SyncSupabaseLikeForLlm,
  entry: SyncQueueEntry,
  helpers: EngineHelpers,
): Promise<ProcessResult> {
  const db = getDb();
  const message = await db.messages.get(entry.row_id);
  if (!message) {
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }
  // Anti-boucle défensive : assistant/system ne doivent jamais déclencher
  // un dispatch (le trigger appendLocalMessage déjà gate sur user, mais
  // sécurité en profondeur).
  if (message.role !== "user") {
    await helpers.markLocalRowSynced(entry);
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }

  const visit = await db.visits.get(message.visit_id);
  if (!visit) {
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }

  const latestState = await getLatestLocalJsonState(visit.id);
  if (!latestState) {
    return await helpers.scheduleDependencyWait(entry, "json_state_missing");
  }

  const attachments = await db.attachments
    .where("message_id")
    .equals(message.id)
    .toArray();

  for (const a of attachments) {
    if (a.sync_status !== "synced") {
      return await helpers.scheduleDependencyWait(entry, "attachments_not_synced");
    }
    const desc = await getLatestAiDescriptionForAttachment(a.id);
    if (!desc) {
      return await helpers.scheduleDependencyWait(entry, "ai_description_pending");
    }
  }

  // Charger les 8 derniers messages de la visite
  const recentRaw = await db.messages
    .where("[visit_id+created_at]")
    .between([visit.id, ""], [visit.id, "\uffff"])
    .toArray();
  const recent = recentRaw
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-8);

  const attachmentDescriptions = await Promise.all(
    attachments.map(async (a) => {
      const d = await getLatestAiDescriptionForAttachment(a.id);
      return {
        attachment_id: a.id,
        media_profile: a.media_profile,
        description: d!.description,
      };
    }),
  );

  // Construction + compression context bundle
  const visitRow: VisitRow = visit;
  const bundle = buildContextBundle({
    visit: visitRow,
    latestState,
    recentMessages: recent as MessageRow[],
    attachmentDescriptions,
  });
  const compressed = compressContextBundle(bundle);
  if (compressed.status === "failed") {
    await appendLocalLlmExtraction({
      userId: message.user_id,
      visitId: message.visit_id,
      messageId: message.id,
      mode: "extract_from_message",
      provider: "lovable_gemini",
      modelVersion: "skipped",
      contextBundle: { skipped: true },
      rawRequestSummary: { reason: "context_too_large_after_compress" },
      rawResponse: {},
      status: "failed",
      errorMessage: "context_too_large_after_compress",
      warnings: [`passes_applied=${compressed.passes_applied}`],
    });
    await helpers.markLocalRowSynced(entry);
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }

  // Router déterministe (fallback LLM non utilisé en Phase 2)
  const routed = routeMessage({
    role: message.role,
    kind: message.kind,
    content: message.content,
  });
  // routed.needsLlm est false par construction (cf. router.ts) — on n'invoque
  // pas routeMessageLlm ici. Si Phase 2.5 réintroduit needsLlm, brancher ici.
  if (routed.needsLlm) {
    await helpers.markLocalRowSynced(entry);
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }
  const decision = routed.decision;

  if (decision.route === "ignore") {
    await helpers.markLocalRowSynced(entry);
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "ok";
  }

  if (decision.route === "extract") {
    return await handleExtract(message, visit, latestState.state, compressed.bundle, entry, helpers);
  }

  // conversational
  return await handleConversational(message, compressed.bundle, entry, helpers);
}

// ---------------------------------------------------------------------------
// handleExtract / handleConversational
// ---------------------------------------------------------------------------

async function handleExtract(
  message: MessageRow,
  visit: VisitRow,
  currentState: import("@/shared/types").VisitJsonState,
  bundle: ContextBundle,
  entry: SyncQueueEntry,
  helpers: EngineHelpers,
): Promise<ProcessResult> {
  void visit;
  const db = getDb();
  let resp: CallVtuLlmAgentResponse;
  try {
    resp = await callVtuLlmAgent({
      mode: "extract",
      messageText: message.content ?? "",
      contextBundle: bundle,
    });
  } catch (err) {
    return await helpers.scheduleRetryOrFail(entry, err);
  }

  if (!resp.ok) {
    return await handleLlmError(
      { ...resp, stable_prompt_hash: "" },
      entry,
      helpers,
      {
        userId: message.user_id,
        visitId: message.visit_id,
        messageId: message.id,
        mode: "extract_from_message",
      },
    );
  }

  const result = resp.result;
  const raw = resp.raw_response;

  // Persistance audit trail d'abord pour avoir l'extraction_id à référencer.
  const extraction = await appendLocalLlmExtraction({
    userId: message.user_id,
    visitId: message.visit_id,
    messageId: message.id,
    mode: "extract_from_message",
    provider: resp.meta.provider,
    modelVersion: resp.meta.model_version,
    inputTokens: resp.meta.input_tokens,
    outputTokens: resp.meta.output_tokens,
    cachedInputTokens: resp.meta.cached_input_tokens,
    latencyMs: resp.meta.latency_ms,
    confidenceOverall: result.confidence_overall,
    contextBundle: bundle as unknown as Record<string, unknown>,
    rawRequestSummary: {
      mode: "extract_from_message",
      model: resp.meta.model_version,
      schema_version: bundle.schema_version,
    },
    stablePromptHash: null,
    providerRequestId: resp.meta.provider_request_id,
    rawResponse: raw,
    patchesCount: result.patches?.length ?? 0,
    customFieldsCount: result.custom_fields?.length ?? 0,
    status: "success",
    warnings: result.warnings ?? [],
  });

  // Apply patches + custom fields immédiatement (Field<T> en
  // validation_status="unvalidated", source="ai_infer"). Le user validera
  // ensuite via la PendingActionsCard.
  const afterPatches = applyPatches({
    state: currentState,
    patches: result.patches ?? [],
    sourceMessageId: message.id,
    sourceExtractionId: extraction.id,
  });
  const afterCustom = applyCustomFields({
    state: afterPatches.state,
    customFields: result.custom_fields ?? [],
    sourceMessageId: message.id,
    sourceExtractionId: extraction.id,
  });

  const totalChanges =
    afterPatches.applied.length + afterCustom.applied.length;
  if (totalChanges > 0) {
    await appendJsonStateVersion({
      userId: message.user_id,
      visitId: message.visit_id,
      state: afterCustom.state,
      createdByMessageId: message.id,
      sourceExtractionId: extraction.id,
    });
  }

  // It. 10.5 — Message assistant : actions_card si patches/custom_fields,
  // sinon text simple. Plus jamais de "Aucun champ mis à jour".
  // It. 11 — Si des patches ont été ignorés pour `human_source_prime`,
  //   on émet en PLUS un message `conflict_card` séparé. Le user
  //   arbitrera via ConflictCard sans polluer le actions_card normal.
  const hasProposals =
    (result.patches?.length ?? 0) > 0 || (result.custom_fields?.length ?? 0) > 0;
  const assistantMessage = (result.assistant_message ?? "").trim() ||
    "Bien noté, n'hésite pas à préciser.";
  const ignoredPaths = afterPatches.ignored.map((i) => ({
    path: i.path,
    reason: i.reason,
  }));
  const conflictPaths = ignoredPaths.filter((i) => i.reason === "human_source_prime");
  const proposedPatches = result.patches ?? [];

  await appendLocalMessage({
    userId: message.user_id,
    visitId: message.visit_id,
    role: "assistant",
    kind: hasProposals ? "actions_card" : "text",
    content: assistantMessage,
    metadata: {
      llm_extraction_id: extraction.id,
      mode: "extract",
      proposed_patches: proposedPatches,
      proposed_custom_fields: result.custom_fields ?? [],
      applied_paths: afterPatches.applied.map((a) => a.path),
      ignored_paths: ignoredPaths,
    },
  });

  // It. 11 — message conflict_card dédié si conflits humains détectés.
  if (conflictPaths.length > 0) {
    const conflictPatches = proposedPatches.filter((p) =>
      conflictPaths.some((c) => c.path === p.path),
    );
    await appendLocalMessage({
      userId: message.user_id,
      visitId: message.visit_id,
      role: "assistant",
      kind: "conflict_card",
      content:
        conflictPaths.length === 1
          ? "J'ai relevé une valeur différente de la tienne — laquelle garder ?"
          : `J'ai relevé ${conflictPaths.length} valeurs différentes des tiennes — arbitre celles à garder.`,
      metadata: {
        llm_extraction_id: extraction.id,
        mode: "extract",
        proposed_patches: conflictPatches,
        ignored_paths: conflictPaths,
        // ai_enabled=false pour éviter tout dispatch LLM sur ce message
        // (gate dans messages.repo.ts).
        ai_enabled: false,
      },
    });
  }

  await helpers.markLocalRowSynced(entry);
  if (entry.id != null) await db.sync_queue.delete(entry.id);
  return "ok";
}

async function handleConversational(
  message: MessageRow,
  bundle: ContextBundle,
  entry: SyncQueueEntry,
  helpers: EngineHelpers,
): Promise<ProcessResult> {
  const db = getDb();
  let resp: CallVtuLlmAgentResponse;
  try {
    resp = await callVtuLlmAgent({
      mode: "conversational",
      messageText: message.content ?? "",
      contextBundle: bundle,
    });
  } catch (err) {
    return await helpers.scheduleRetryOrFail(entry, err);
  }

  if (!resp.ok) {
    return await handleLlmError(
      { ...resp, stable_prompt_hash: "" },
      entry,
      helpers,
      {
        userId: message.user_id,
        visitId: message.visit_id,
        messageId: message.id,
        mode: "conversational_query",
      },
    );
  }

  const result = resp.result;
  const raw = resp.raw_response;

  const extraction = await appendLocalLlmExtraction({
    userId: message.user_id,
    visitId: message.visit_id,
    messageId: message.id,
    mode: "conversational_query",
    provider: resp.meta.provider,
    modelVersion: resp.meta.model_version,
    inputTokens: resp.meta.input_tokens,
    outputTokens: resp.meta.output_tokens,
    cachedInputTokens: resp.meta.cached_input_tokens,
    latencyMs: resp.meta.latency_ms,
    confidenceOverall: result.confidence_overall,
    contextBundle: bundle as unknown as Record<string, unknown>,
    rawRequestSummary: {
      mode: "conversational_query",
      model: resp.meta.model_version,
      schema_version: bundle.schema_version,
    },
    stablePromptHash: null,
    providerRequestId: resp.meta.provider_request_id,
    rawResponse: raw,
    status: "success",
    warnings: result.warnings ?? [],
  });

  const assistantMessage = (result.assistant_message ?? "").trim() ||
    "Désolé, je n'ai pas su répondre à cette question.";
  await appendLocalMessage({
    userId: message.user_id,
    visitId: message.visit_id,
    role: "assistant",
    kind: "text",
    content: assistantMessage,
    metadata: {
      llm_extraction_id: extraction.id,
      mode: "conversational",
    },
  });

  await helpers.markLocalRowSynced(entry);
  if (entry.id != null) await db.sync_queue.delete(entry.id);
  return "ok";
}

// ---------------------------------------------------------------------------
// Erreurs LLM (rate_limited, payment_required, malformed, network)
// ---------------------------------------------------------------------------

interface LlmErrorContext {
  userId: string;
  visitId: string;
  messageId?: string | null;
  attachmentId?: string | null;
  mode: import("@/shared/types").LlmMode;
}

interface LlmErrorResp {
  ok: false;
  error_code: string;
  error_message: string;
  retryable: boolean;
  stable_prompt_hash: string;
}

const RATE_LIMIT_MAX_RETRIES = 3;

async function handleLlmError(
  resp: LlmErrorResp,
  entry: SyncQueueEntry,
  helpers: EngineHelpers,
  ctx: LlmErrorContext,
): Promise<ProcessResult> {
  const db = getDb();

  if (resp.error_code === "rate_limited") {
    if (entry.attempts >= RATE_LIMIT_MAX_RETRIES) {
      await appendLocalLlmExtraction({
        userId: ctx.userId,
        visitId: ctx.visitId,
        messageId: ctx.messageId ?? null,
        attachmentId: ctx.attachmentId ?? null,
        mode: ctx.mode,
        provider: "lovable_gemini",
        modelVersion: "unknown",
        contextBundle: {},
        rawRequestSummary: { rate_limited_after: RATE_LIMIT_MAX_RETRIES },
        rawResponse: {},
        stablePromptHash: resp.stable_prompt_hash,
        status: "rate_limited",
        errorMessage: resp.error_message,
      });
      await helpers.markLocalRowFailed(entry, resp.error_message);
      if (entry.id != null) await db.sync_queue.delete(entry.id);
      return "failed";
    }
    return await helpers.scheduleDependencyWait(entry, "rate_limited");
  }

  if (resp.error_code === "payment_required") {
    await appendLocalLlmExtraction({
      userId: ctx.userId,
      visitId: ctx.visitId,
      messageId: ctx.messageId ?? null,
      attachmentId: ctx.attachmentId ?? null,
      mode: ctx.mode,
      provider: "lovable_gemini",
      modelVersion: "unknown",
      contextBundle: {},
      rawRequestSummary: { error: "payment_required" },
      rawResponse: {},
      stablePromptHash: resp.stable_prompt_hash,
      status: "failed",
      errorMessage: resp.error_message,
    });
    await helpers.markLocalRowFailed(entry, resp.error_message);
    if (entry.id != null) await db.sync_queue.delete(entry.id);
    return "failed";
  }

  if (resp.error_code === "malformed_response") {
    if (entry.attempts >= 1) {
      await appendLocalLlmExtraction({
        userId: ctx.userId,
        visitId: ctx.visitId,
        messageId: ctx.messageId ?? null,
        attachmentId: ctx.attachmentId ?? null,
        mode: ctx.mode,
        provider: "lovable_gemini",
        modelVersion: "unknown",
        contextBundle: {},
        rawRequestSummary: { error: "malformed_response" },
        rawResponse: {},
        stablePromptHash: resp.stable_prompt_hash,
        status: "malformed",
        errorMessage: resp.error_message,
      });
      await helpers.markLocalRowFailed(entry, resp.error_message);
      if (entry.id != null) await db.sync_queue.delete(entry.id);
      return "failed";
    }
    return await helpers.scheduleRetryOrFail(entry, new Error(resp.error_message));
  }

  return await helpers.scheduleRetryOrFail(entry, new Error(resp.error_message));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Quand un describe_media aboutit, on réveille les jobs
 * llm_route_and_dispatch en attente sur le même message (Correction C v2.1).
 */
async function wakeUpPendingDispatchJobs(
  messageId: string | null,
): Promise<void> {
  if (!messageId) return;
  const db = getDb();
  const now = new Date().toISOString();
  let pending: SyncQueueEntry[] = [];
  try {
    pending = await db.sync_queue
      .where("[op+row_id]")
      .equals(["llm_route_and_dispatch", messageId])
      .toArray();
  } catch {
    // Index manquant en environnements de test legacy → no-op.
    return;
  }
  for (const j of pending) {
    if (j.id == null) continue;
    if (j.next_attempt_at <= now) continue;
    await db.sync_queue.update(j.id, { next_attempt_at: now });
  }
}

/**
 * It. 14 — Émet une bulle assistant `photo_caption` dès qu'une photo est
 * décrite, à condition qu'elle fasse partie d'un batch (≥ 2 attachments
 * sur le même message). Permet à l'utilisateur de voir la progression
 * photo-par-photo au lieu d'attendre 2-4 min en silence.
 *
 * Idempotent : on cherche un message assistant existant avec
 * `metadata.attachment_id` égal et on skippe si trouvé. Anti-boucle LLM
 * via `metadata.ai_enabled = false`.
 */
async function maybeEmitPhotoCaption(args: {
  attachment: import("@/shared/db").LocalAttachment;
  shortCaption: string;
}): Promise<void> {
  const { attachment, shortCaption } = args;
  if (!attachment.message_id) return;

  const db = getDb();

  // 1. Combien d'attachments sur le message porteur ?
  const siblings = await db.attachments
    .where("message_id")
    .equals(attachment.message_id)
    .toArray();
  if (siblings.length < 2) return; // batch unique → on attend l'extract final

  // 2. Idempotence : caption déjà émise pour cet attachment ?
  const existing = await db.messages
    .where("visit_id")
    .equals(attachment.visit_id)
    .toArray();
  const already = existing.some(
    (m) =>
      m.role === "assistant" &&
      m.kind === "text" &&
      (m.metadata as Record<string, unknown> | undefined)?.kind_origin ===
        "photo_caption" &&
      (m.metadata as Record<string, unknown> | undefined)?.attachment_id ===
        attachment.id,
  );
  if (already) return;

  // 3. Index dans le batch (1-based) pour affichage "n/N"
  const sortedIds = siblings
    .map((s) => s.id)
    .sort((a, b) => a.localeCompare(b));
  const indexInBatch = sortedIds.indexOf(attachment.id) + 1;

  await appendLocalMessage({
    userId: attachment.user_id,
    visitId: attachment.visit_id,
    role: "assistant",
    kind: "text",
    content: shortCaption?.trim() || "Photo analysée.",
    metadata: {
      kind_origin: "photo_caption",
      attachment_id: attachment.id,
      parent_message_id: attachment.message_id,
      batch_index: indexInBatch,
      batch_total: siblings.length,
      // ai_enabled=false : empêche tout dispatch LLM secondaire (gate dans
      // appendLocalMessage / messages.repo.ts).
      ai_enabled: false,
    },
  });
}

function buildExtractSummary(
  patchCount: number,
  customCount: number,
  ignoredCount: number,
  warnings: string[],
): string {
  const parts: string[] = [];
  if (patchCount > 0) parts.push(`${patchCount} champ(s) mis à jour`);
  if (customCount > 0) parts.push(`${customCount} champ(s) personnalisé(s) ajouté(s)`);
  if (parts.length === 0) parts.push("Aucun champ mis à jour");
  if (ignoredCount > 0) parts.push(`${ignoredCount} ignoré(s)`);
  let body = parts.join(" · ");
  if (warnings.length > 0) {
    body += `\n\nAvertissements : ${warnings.slice(0, 3).join(" ; ")}`;
  }
  body += "\n\n_À valider dans le panneau JSON._";
  return body;
}

// Re-export pour les tests
export type { ProviderMeta };
