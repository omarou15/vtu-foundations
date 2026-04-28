/**
 * VTU — Client provider pour l'Edge Function `vtu-llm-agent` (It. 10.5).
 *
 * Remplace les server functions TanStack `extractFromMessage` et
 * `conversationalQuery`. Latence cible <8s (vs ~50s en TanStack).
 *
 * Le payload retourné par l'Edge est nativement JSON — plus besoin du
 * workaround `result_json/raw_response_json` (cf. dette §10).
 *
 * Auth : Bearer JWT du user courant (récupéré via supabase.auth.getSession()).
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  AiCustomField,
  AiFieldPatch,
  AiInsertEntry,
  ContextBundle,
  ProviderMeta,
} from "../types";

const FUNCTION_NAME = "vtu-llm-agent";

export interface UnifiedAgentResult {
  assistant_message: string;
  patches: AiFieldPatch[];
  /** It. 11.6 — opérations `insert_entry` (création d'entrée de collection). */
  insert_entries: AiInsertEntry[];
  custom_fields: AiCustomField[];
  warnings: string[];
  confidence_overall: number;
}

export type CallVtuLlmAgentResponse =
  | {
      ok: true;
      result: UnifiedAgentResult;
      meta: ProviderMeta;
      raw_response: Record<string, unknown>;
    }
  | {
      ok: false;
      error_code: string;
      error_message: string;
      retryable: boolean;
    };

export interface CallVtuLlmAgentInput {
  mode: "extract" | "conversational";
  messageText: string;
  contextBundle: ContextBundle;
  /**
   * Identifiant Lovable AI Gateway du modèle à utiliser. Si absent ou non
   * autorisé côté Edge, l'Edge Function retombe sur le modèle par défaut.
   * Renseigné par `engine.llm.ts` à partir de `useChatStore.selectedModel`.
   */
  model?: string;
}

function getEdgeUrl(): string {
  const base =
    (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_SUPABASE_URL ??
    (typeof process !== "undefined" ? process.env?.SUPABASE_URL : undefined);
  if (!base) {
    throw new Error("VITE_SUPABASE_URL missing — cannot reach Edge Function");
  }
  return `${base}/functions/v1/${FUNCTION_NAME}`;
}

export async function callVtuLlmAgent(
  input: CallVtuLlmAgentInput,
): Promise<CallVtuLlmAgentResponse> {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData?.session?.access_token) {
    return {
      ok: false,
      error_code: "unauthorized",
      error_message: "No active session",
      retryable: false,
    };
  }
  const token = sessionData.session.access_token;

  let resp: Response;
  try {
    resp = await fetch(getEdgeUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      ok: false,
      error_code: "network",
      error_message: (err as Error).message ?? "fetch failed",
      retryable: true,
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return {
      ok: false,
      error_code: "malformed_response",
      error_message: `Invalid JSON from Edge (status ${resp.status})`,
      retryable: false,
    };
  }

  if (!resp.ok) {
    const b = body as Partial<{
      error_code: string;
      error_message: string;
      retryable: boolean;
    }>;
    return {
      ok: false,
      error_code: b.error_code ?? `http_${resp.status}`,
      error_message: b.error_message ?? `HTTP ${resp.status}`,
      retryable: Boolean(b.retryable),
    };
  }

  const b = body as {
    ok?: boolean;
    result?: UnifiedAgentResult;
    meta?: ProviderMeta;
    raw_response?: Record<string, unknown>;
  };
  if (!b.ok || !b.result || !b.meta) {
    return {
      ok: false,
      error_code: "malformed_response",
      error_message: "Edge response missing ok/result/meta",
      retryable: false,
    };
  }

  return {
    ok: true,
    result: b.result,
    meta: b.meta,
    raw_response: b.raw_response ?? {},
  };
}
