/**
 * Provider Lovable AI Gateway (Gemini via OpenAI-compatible API).
 *
 * Cible : appelé UNIQUEMENT depuis la server function (`src/server/llm.functions.ts`).
 * Côté Worker, lit `process.env.LOVABLE_API_KEY`. Pas d'usage browser.
 *
 * Implémentation tool-calling pour structured output (cf. Lovable AI doc :
 * `response_format: json_schema` peut diverger entre providers — tool
 * calling est universel).
 */

import { LlmError, type LlmErrorCode, type ProviderMeta } from "../types";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Modèles supportés par Lovable AI Gateway pour cette itération. */
export type GeminiModel =
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-flash-lite"
  | "google/gemini-2.5-pro";

export const DEFAULT_MODEL: GeminiModel = "google/gemini-2.5-flash";
export const ROUTER_FALLBACK_MODEL: GeminiModel = "google/gemini-2.5-flash-lite";

export interface CallGeminiInput {
  apiKey: string;
  model: GeminiModel;
  systemPrompt: string;
  userPrompt: string;
  /** Si présent, force tool calling pour structured output. */
  toolSchema?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  /** Pour les modes multimodaux (describe_media). */
  imageUrl?: string;
  /** Surcharge fetch pour tests. */
  fetchImpl?: typeof fetch;
}

export interface CallGeminiResult {
  content: unknown;
  meta: ProviderMeta;
  rawResponse: Record<string, unknown>;
}

/**
 * Appelle le gateway et retourne le payload tool-call ou contenu texte.
 * Lance LlmError typée sur les erreurs connues.
 */
export async function callGemini(input: CallGeminiInput): Promise<CallGeminiResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const startedAt = Date.now();

  const userMessage: Record<string, unknown> = input.imageUrl
    ? {
        role: "user",
        content: [
          { type: "text", text: input.userPrompt },
          { type: "image_url", image_url: { url: input.imageUrl } },
        ],
      }
    : { role: "user", content: input.userPrompt };

  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      userMessage,
    ],
    stream: false,
  };

  if (input.toolSchema) {
    body.tools = [
      {
        type: "function",
        function: {
          name: input.toolSchema.name,
          description: input.toolSchema.description,
          parameters: input.toolSchema.parameters,
        },
      },
    ];
    body.tool_choice = {
      type: "function",
      function: { name: input.toolSchema.name },
    };
  }

  let response: Response;
  try {
    response = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LlmError("network", (err as Error).message, true);
  }

  const latency_ms = Date.now() - startedAt;

  if (response.status === 429) {
    throw new LlmError("rate_limited", "Rate limited by AI gateway", true);
  }
  if (response.status === 402) {
    throw new LlmError(
      "payment_required",
      "Lovable AI credits exhausted — top up via Settings → Workspace → Usage",
      false,
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new LlmError(
      mapHttpToCode(response.status),
      `AI gateway HTTP ${response.status}: ${text.slice(0, 300)}`,
      response.status >= 500,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    throw new LlmError(
      "malformed_response",
      `Cannot parse JSON: ${(err as Error).message}`,
      false,
    );
  }

  const choice = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
  if (!choice) {
    throw new LlmError("malformed_response", "no choices[0]", false);
  }

  const message = choice.message as Record<string, unknown> | undefined;
  let content: unknown;
  if (input.toolSchema) {
    const toolCalls = (message?.tool_calls as Array<Record<string, unknown>> | undefined) ?? [];
    const first = toolCalls[0];
    const fn = first?.function as { arguments?: string } | undefined;
    if (!fn?.arguments) {
      throw new LlmError("malformed_response", "no tool call returned", false);
    }
    try {
      content = JSON.parse(fn.arguments);
    } catch {
      throw new LlmError("malformed_response", "tool args not JSON", false);
    }
  } else {
    content = message?.content ?? null;
  }

  const usage = (parsed.usage as Record<string, number> | undefined) ?? {};

  const meta: ProviderMeta = {
    provider: "lovable_gemini",
    model_version: input.model,
    input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
    output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
    cached_input_tokens:
      typeof usage.prompt_tokens_details === "object"
        ? ((usage.prompt_tokens_details as unknown as Record<string, number>)
            ?.cached_tokens ?? null)
        : null,
    cost_usd: null,
    latency_ms,
    provider_request_id:
      typeof parsed.id === "string" ? (parsed.id as string) : null,
  };

  return { content, meta, rawResponse: parsed };
}

function mapHttpToCode(status: number): LlmErrorCode {
  if (status === 429) return "rate_limited";
  if (status === 402) return "payment_required";
  if (status === 413) return "context_too_large";
  if (status >= 500) return "network";
  return "unknown";
}
