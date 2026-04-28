/**
 * VTU — Server functions LLM (It. 10)
 *
 * Toutes les invocations Gemini passent par ici (jamais depuis le client).
 * Lit `process.env.LOVABLE_API_KEY` côté Worker.
 *
 * Modes exposés :
 *  - describeMedia(attachmentSignedUrl, mediaProfile, hint)
 *  - extractFromMessage(messageText, contextBundle)
 *  - conversationalQuery(messageText, contextBundle)
 *  - routeMessageLlm(text) — fallback Flash-Lite (rare)
 *
 * Toutes valident leur sortie via Zod et renvoient un payload typé +
 * meta provider. Les call sites (sync engine + UI) écrivent ensuite la
 * ligne llm_extractions et appliquent les patches localement.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  callGemini,
  DEFAULT_MODEL,
  ROUTER_FALLBACK_MODEL,
  type GeminiModel,
} from "@/shared/llm/providers/lovable-gemini";
import {
  ConversationalOutputSchema,
  DescribeMediaOutputSchema,
  ExtractOutputSchema,
  RouterOutputSchema,
} from "@/shared/llm/schemas";
import {
  SYSTEM_CONVERSATIONAL,
  SYSTEM_DESCRIBE_MEDIA,
  SYSTEM_EXTRACT,
  SYSTEM_ROUTER,
} from "@/shared/llm/prompts";
import { hashContext } from "@/shared/llm/context/hash";
import { LlmError } from "@/shared/llm/types";
import {
  buildUserPromptConversational as _buildConv,
  buildUserPromptExtract as _buildExt,
} from "./llm.prompt-builders";
// NOTE : pas de middleware d'auth ici — les server functions TanStack Start
// ne propagent pas automatiquement le JWT Supabase. La lecture du prompt
// `describe_media` éditable se fait côté Edge Function `vtu-llm-agent`
// pour le chat ; ici on retombe sur la constante par défaut.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    throw new Error(
      "LOVABLE_API_KEY missing on server (Lovable Cloud should auto-provision)",
    );
  }
  return key;
}

const ContextBundleSchema = z.object({
  schema_version: z.number(),
  visit: z.object({
    id: z.string(),
    mission_type: z.string().nullable(),
    building_type: z.string().nullable(),
  }),
  /** JSON state complet — validation lâche, déjà validé en amont. */
  state: z.unknown(),
  recent_messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      kind: z.string(),
      content: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});

// Schémas en JSON pour tool calling — version "lâche" (pas de valid Zod stricte côté gateway).
const DESCRIBE_MEDIA_TOOL_PARAMS = {
  type: "object",
  properties: {
    short_caption: { type: "string" },
    detailed_description: { type: ["string", "null"] },
    structured_observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_hint: { type: "string" },
          observation: { type: "string" },
        },
        required: ["section_hint", "observation"],
        additionalProperties: false,
      },
    },
    ocr_text: { type: ["string", "null"] },
    confidence_overall: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "short_caption",
    "detailed_description",
    "ocr_text",
    "confidence_overall",
  ],
  additionalProperties: false,
} as const;

// It. 11.6 — 3 verbes : patches (set_field), insert_entries (insert_entry),
// custom_fields (vocabulaire émergent).
const EXTRACT_TOOL_PARAMS = {
  type: "object",
  properties: {
    patches: {
      type: "array",
      description:
        "set_field — modifie un Field<T> existant. path ∈ schema_map.object_fields OU '<collection>[id=<UUID>].<field>'. PAS d'index positionnel.",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          value: {},
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: { type: "string" } },
        },
        required: ["path", "value", "confidence"],
        additionalProperties: false,
      },
    },
    insert_entries: {
      type: "array",
      description:
        "insert_entry — crée une nouvelle entrée dans une collection connue. UUID généré côté serveur.",
      items: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description:
              "Path absolu vers la collection (ex 'heating.installations'). DOIT ∈ schema_map.collections.",
          },
          fields: {
            type: "object",
            description:
              "Valeurs initiales : keys DOIVENT ∈ schema_map.collections[collection].item_fields. Au moins 1 clé.",
            minProperties: 1,
            additionalProperties: true,
          },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: { type: "string" } },
        },
        required: ["collection", "fields", "confidence"],
        additionalProperties: false,
      },
    },
    custom_fields: {
      type: "array",
      description: "custom_field — vocabulaire émergent hors schéma rigide.",
      items: {
        type: "object",
        properties: {
          section_path: { type: "string" },
          field_key: { type: "string" },
          label_fr: { type: "string" },
          value: {},
          value_type: {
            type: "string",
            enum: ["string", "number", "boolean", "enum", "multi_enum"],
          },
          unit: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence_refs: { type: "array", items: { type: "string" } },
        },
        required: [
          "section_path",
          "field_key",
          "label_fr",
          "value",
          "value_type",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    confidence_overall: { type: "number" },
  },
  required: ["confidence_overall"],
  additionalProperties: false,
} as const;

const CONVERSATIONAL_TOOL_PARAMS = {
  type: "object",
  properties: {
    answer_markdown: { type: "string" },
    evidence_refs: { type: "array", items: { type: "string" } },
    confidence_overall: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["answer_markdown", "confidence_overall"],
  additionalProperties: false,
} as const;

const ROUTER_TOOL_PARAMS = {
  type: "object",
  properties: {
    route: {
      type: "string",
      enum: ["ignore", "extract", "conversational"],
    },
    reason: { type: "string" },
  },
  required: ["route", "reason"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const describeMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      imageUrl?: string;
      imageDataUrl?: string;
      mediaProfile: "photo" | "plan" | "pdf";
      mimeType: string | null;
      model?: GeminiModel;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    // PDFs : skipped en amont du sync engine (cf. Q2). Sécurité ici aussi.
    if (data.mediaProfile === "pdf") {
      const skippedResult = {
        short_caption: "PDF non analysé (Phase 2)",
        detailed_description: null,
        structured_observations: [],
        ocr_text: null,
        confidence_overall: 0,
        warnings: ["pdf_no_render_phase2"],
      };
      return {
        ok: true as const,
        result_json: JSON.stringify(skippedResult),
        meta: {
          provider: "lovable_gemini",
          model_version: "skipped",
          input_tokens: 0,
          output_tokens: 0,
          cached_input_tokens: null,
          cost_usd: 0,
          latency_ms: 0,
          provider_request_id: null,
        },
        stable_prompt_hash: await hashContext({
          mode: "describe_media_skipped",
        }),
        raw_response_json: JSON.stringify({ skipped: true }),
      };
    }

    // Lecture du prompt actif (kind=describe_media) en DB pour cet
    // utilisateur. Fallback sur la constante par défaut si rien sauvegardé.
    let activeSystemPrompt = SYSTEM_DESCRIBE_MEDIA;
    try {
      const { data: promptRow } = await context.supabase
        .from("llm_system_prompts")
        .select("content")
        .eq("user_id", context.userId)
        .eq("kind", "describe_media")
        .eq("is_active", true)
        .maybeSingle();
      if (
        promptRow &&
        typeof promptRow.content === "string" &&
        promptRow.content.length > 0
      ) {
        activeSystemPrompt = promptRow.content;
      }
    } catch (err) {
      console.warn(
        "[describeMedia] system_prompt_db_read_failed",
        (err as Error).message,
      );
    }

    const model = data.model ?? DEFAULT_MODEL;
    const userPrompt = `Décris cette image (mediaProfile=${data.mediaProfile}). Suis le schéma de sortie strict.`;
    const stable = await hashContext({
      mode: "describe_media",
      model,
      mediaProfile: data.mediaProfile,
      userPrompt,
      systemHash: hashSystem(activeSystemPrompt),
    });

    try {
      const out = await callGemini({
        apiKey: getApiKey(),
        model,
        systemPrompt: activeSystemPrompt,
        userPrompt,
        imageUrl: data.imageDataUrl ?? data.imageUrl,
        imageMimeType: data.mimeType,
        toolSchema: {
          name: "describe_media",
          description: "Output structured description for the image",
          parameters: DESCRIBE_MEDIA_TOOL_PARAMS,
        },
      });
      const validated = DescribeMediaOutputSchema.parse(out.content);
      return {
        ok: true as const,
        result_json: JSON.stringify(validated),
        meta: out.meta,
        stable_prompt_hash: stable,
        raw_response_json: JSON.stringify(out.rawResponse),
      };
    } catch (err) {
      return errorPayload(err, stable);
    }
  });

export const extractFromMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      messageText: string;
      contextBundle: unknown;
      model?: GeminiModel;
    }) => ({
      messageText: z.string().min(1).max(8000).parse(data.messageText),
      contextBundle: ContextBundleSchema.parse(data.contextBundle),
      model: data.model,
    }),
  )
  .handler(async ({ data }) => {
    const model = data.model ?? DEFAULT_MODEL;
    const userPrompt = buildUserPromptExtract(data.messageText, data.contextBundle);
    const stable = await hashContext({
      mode: "extract_from_message",
      model,
      systemHash: hashSystem(SYSTEM_EXTRACT),
      contextBundle: data.contextBundle,
      messageText: data.messageText,
    });
    try {
      const out = await callGemini({
        apiKey: getApiKey(),
        model,
        systemPrompt: SYSTEM_EXTRACT,
        userPrompt,
        toolSchema: {
          name: "extract_visit_data",
          description: "Output JSON patches and custom_fields for the visit state",
          parameters: EXTRACT_TOOL_PARAMS,
        },
      });
      const validated = ExtractOutputSchema.parse(out.content);
      return {
        ok: true as const,
        result_json: JSON.stringify(validated),
        meta: out.meta,
        stable_prompt_hash: stable,
        raw_response_json: JSON.stringify(out.rawResponse),
      };
    } catch (err) {
      return errorPayload(err, stable);
    }
  });

export const conversationalQuery = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      messageText: string;
      contextBundle: unknown;
      model?: GeminiModel;
    }) => ({
      messageText: z.string().min(1).max(8000).parse(data.messageText),
      contextBundle: ContextBundleSchema.parse(data.contextBundle),
      model: data.model,
    }),
  )
  .handler(async ({ data }) => {
    const model = data.model ?? DEFAULT_MODEL;
    const userPrompt = buildUserPromptConversational(
      data.messageText,
      data.contextBundle,
    );
    const stable = await hashContext({
      mode: "conversational_query",
      model,
      systemHash: hashSystem(SYSTEM_CONVERSATIONAL),
      contextBundle: data.contextBundle,
      messageText: data.messageText,
    });
    try {
      const out = await callGemini({
        apiKey: getApiKey(),
        model,
        systemPrompt: SYSTEM_CONVERSATIONAL,
        userPrompt,
        toolSchema: {
          name: "conversational_answer",
          description: "Markdown answer + sources for the thermicien's question",
          parameters: CONVERSATIONAL_TOOL_PARAMS,
        },
      });
      const validated = ConversationalOutputSchema.parse(out.content);
      return {
        ok: true as const,
        result_json: JSON.stringify(validated),
        meta: out.meta,
        stable_prompt_hash: stable,
        raw_response_json: JSON.stringify(out.rawResponse),
      };
    } catch (err) {
      return errorPayload(err, stable);
    }
  });

export const routeMessageLlm = createServerFn({ method: "POST" })
  .inputValidator((data: { messageText: string }) => ({
    messageText: z.string().min(1).max(2000).parse(data.messageText),
  }))
  .handler(async ({ data }) => {
    const stable = await hashContext({
      mode: "router",
      model: ROUTER_FALLBACK_MODEL,
      messageText: data.messageText,
    });
    try {
      const out = await callGemini({
        apiKey: getApiKey(),
        model: ROUTER_FALLBACK_MODEL,
        systemPrompt: SYSTEM_ROUTER,
        userPrompt: data.messageText,
        toolSchema: {
          name: "route_message",
          description: "Classify the user message into ignore|extract|conversational",
          parameters: ROUTER_TOOL_PARAMS,
        },
      });
      const validated = RouterOutputSchema.parse(out.content);
      return {
        ok: true as const,
        result_json: JSON.stringify(validated),
        meta: out.meta,
        stable_prompt_hash: stable,
        raw_response_json: JSON.stringify(out.rawResponse),
      };
    } catch (err) {
      return errorPayload(err, stable);
    }
  });

// ---------------------------------------------------------------------------
// Helpers prompt building — délégués à `llm.prompt-builders.ts`
// (importés en haut de fichier).
// ---------------------------------------------------------------------------

function buildUserPromptExtract(
  messageText: string,
  bundle: z.infer<typeof ContextBundleSchema>,
): string {
  return _buildExt(messageText, bundle as unknown as Record<string, unknown>);
}

function buildUserPromptConversational(
  messageText: string,
  bundle: z.infer<typeof ContextBundleSchema>,
): string {
  return _buildConv(messageText, bundle as unknown as Record<string, unknown>);
}

function hashSystem(prompt: string): string {
  // Hash léger non-crypto — caching observability uniquement.
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = ((h << 5) - h + prompt.charCodeAt(i)) | 0;
  }
  return `s${(h >>> 0).toString(16)}`;
}

function errorPayload(err: unknown, stable: string) {
  if (err instanceof LlmError) {
    return {
      ok: false as const,
      error_code: err.code,
      error_message: err.message,
      retryable: err.retryable,
      stable_prompt_hash: stable,
    };
  }
  return {
    ok: false as const,
    error_code: "unknown" as const,
    error_message: err instanceof Error ? err.message : String(err),
    retryable: false,
    stable_prompt_hash: stable,
  };
}
