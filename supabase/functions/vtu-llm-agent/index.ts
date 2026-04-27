/**
 * VTU — Edge Function `vtu-llm-agent` (It. 10.5)
 *
 * Remplace les server functions TanStack `extractFromMessage` et
 * `conversationalQuery`. Latence cible <8s perçus (vs ~50s en TanStack).
 *
 * Input (JSON) :
 *  {
 *    mode: "extract" | "conversational",
 *    messageText: string,
 *    contextBundle: ContextBundle  // sérialisé tel quel
 *  }
 *
 * Output (JSON) sur 200 :
 *  {
 *    ok: true,
 *    result: {
 *      assistant_message: string,
 *      patches: AiFieldPatch[],
 *      custom_fields: AiCustomField[],
 *      warnings: string[],
 *      confidence_overall: number
 *    },
 *    meta: ProviderMeta,
 *    raw_response: object
 *  }
 *
 * Erreurs :
 *  - 401 auth manquante / invalide
 *  - 429 rate_limited
 *  - 402 payment_required
 *  - 504 timeout
 *  - 502 provider error
 *  - 400 input invalide
 *
 * Sécurité : verify_jwt = true via supabase/config.toml. Le user_id est
 * extrait du JWT côté Edge mais n'est pas re-validé contre le visit_id
 * du context (RLS s'en charge côté `llm_extractions` insert client-side).
 */

// Deno deploy — pas de bundler local. Utilise les imports HTTPS standard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const MODEL = "google/gemini-3-flash-preview";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TIMEOUT_MS = 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// System prompt — copie inline (Edge Function ne partage pas src/).
// Doit rester aligné avec src/shared/llm/prompts/system-unified.ts
// ---------------------------------------------------------------------------

const SYSTEM_UNIFIED = `# VTU — Cerveau IA Thermicien (mode unifié)

Tu es le **collègue IA** d'un thermicien expert en visite terrain. Tu réponds toujours comme un humain qui parle à un humain — pas comme une API.

## TA SORTIE (TOUJOURS via le tool propose_visit_patches)

1. **assistant_message** (string, ≤300 chars) — OBLIGATOIRE, JAMAIS vide.
   - Extraction → annonce : "J'ai relevé 4 informations sur le chauffage et la VMC, vérifie les propositions ci-dessous."
   - Question (résume, explique, comment, ?) → réponse ≤2 phrases factuelles.
   - Salutation / message court → réponse de collègue ("Bonjour ! Décris ce que tu observes et je structurerai tes infos.").
   - INTERDIT : "Aucun champ mis à jour", "Je n'ai rien extrait", "Veuillez fournir plus d'informations".

2. **patches** (array, peut être vide) — modifications atomiques de Field<T> du JSON state.
   - path = dot-notation existante (ex "building.surface_habitable_m2", "ventilation.installations[0].type_value").
   - value typée (string | number | boolean | null).
   - confidence ∈ {low, medium, high}.
   - evidence_refs[] : id(s) message + attachments justifiant.
   - INTERDIT : si state_summary[path].source ∈ {user, voice, photo_ocr, import} ET value !== null → ne pas patcher.

3. **custom_fields** (array, peut être vide) — observations métier non couvertes par le schema rigide.

4. **warnings** (array de strings ≤200 chars).

5. **confidence_overall** ∈ [0,1].

## RÈGLES DURES

- Pas d'invention. Pas de moyenne sectorielle pour combler un trou.
- Si la donnée est explicite → patche, même en low.
- Unités SI obligatoires (m², kW, kWh, °C, %).
- Tone direct, factuel, pro, en français. Maximum 1 émoji discret si pertinent.
`;

// ---------------------------------------------------------------------------
// Tool schema — UnifiedAgentOutput (cf. src/shared/llm/schemas/extract.schema.ts)
// ---------------------------------------------------------------------------

const PROPOSE_VISIT_PATCHES_TOOL = {
  type: "function",
  function: {
    name: "propose_visit_patches",
    description:
      "Produire un message humain pour le thermicien + (éventuels) patches IA + custom_fields + warnings.",
    parameters: {
      type: "object",
      properties: {
        assistant_message: { type: "string" },
        patches: {
          type: "array",
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
        custom_fields: {
          type: "array",
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
      required: ["assistant_message", "confidence_overall"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    if (!LOVABLE_API_KEY) {
      return errorResp(500, "config", "LOVABLE_API_KEY missing on Edge runtime");
    }

    // --- Auth (verify_jwt côté config.toml mais on récupère le user)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResp(401, "unauthorized", "Missing Authorization header");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return errorResp(401, "unauthorized", "Invalid JWT");
    }

    // --- Input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResp(400, "bad_request", "Body must be valid JSON");
    }
    const input = parseInput(body);
    if ("error" in input) {
      return errorResp(400, "bad_request", input.error);
    }

    // --- Build user prompt
    const userPrompt = buildUserPrompt(
      input.mode,
      input.messageText,
      input.contextBundle,
    );

    // --- Call Lovable AI Gateway (timeout 60s)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let gw: Response;
    try {
      gw = await fetch(GATEWAY_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_UNIFIED },
            { role: "user", content: userPrompt },
          ],
          tools: [PROPOSE_VISIT_PATCHES_TOOL],
          tool_choice: {
            type: "function",
            function: { name: "propose_visit_patches" },
          },
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === "AbortError") {
        return errorResp(504, "timeout", "AI gateway timeout (60s)");
      }
      return errorResp(
        502,
        "network",
        `AI gateway fetch failed: ${(err as Error).message}`,
      );
    }
    clearTimeout(timer);

    if (gw.status === 429) {
      return errorResp(429, "rate_limited", "AI gateway rate limit");
    }
    if (gw.status === 402) {
      return errorResp(402, "payment_required", "AI gateway credits exhausted");
    }
    if (!gw.ok) {
      const txt = await gw.text().catch(() => "");
      return errorResp(502, "provider_error", `AI gateway ${gw.status}: ${txt.slice(0, 200)}`);
    }

    const json = await gw.json();
    const choice = json?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "propose_visit_patches") {
      return errorResp(
        502,
        "malformed_response",
        "Missing propose_visit_patches tool call",
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return errorResp(
        502,
        "malformed_response",
        "Tool arguments not valid JSON",
      );
    }

    // Normalisation défensive
    const result = {
      assistant_message:
        typeof parsed.assistant_message === "string" && parsed.assistant_message.length > 0
          ? parsed.assistant_message.slice(0, 400)
          : "Bien noté.",
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
      custom_fields: Array.isArray(parsed.custom_fields) ? parsed.custom_fields : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      confidence_overall:
        typeof parsed.confidence_overall === "number"
          ? parsed.confidence_overall
          : 0.5,
    };

    const latencyMs = Date.now() - t0;
    const usage = json?.usage ?? {};
    const meta = {
      provider: "lovable_gemini",
      model_version: json?.model ?? MODEL,
      input_tokens: usage.prompt_tokens ?? null,
      output_tokens: usage.completion_tokens ?? null,
      cached_input_tokens: usage.prompt_cache_hit_tokens ?? null,
      cost_usd: null,
      latency_ms: latencyMs,
      provider_request_id: json?.id ?? null,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        result,
        meta,
        raw_response: json,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[vtu-llm-agent] uncaught", err);
    return errorResp(
      500,
      "internal",
      `Uncaught: ${(err as Error).message ?? String(err)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedInput {
  mode: "extract" | "conversational";
  messageText: string;
  contextBundle: Record<string, unknown>;
}

function parseInput(body: unknown): ParsedInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  if (b.mode !== "extract" && b.mode !== "conversational") {
    return { error: "mode must be 'extract' or 'conversational'" };
  }
  if (typeof b.messageText !== "string" || b.messageText.length === 0) {
    return { error: "messageText required (non-empty string)" };
  }
  if (b.messageText.length > 8000) {
    return { error: "messageText too long (>8000 chars)" };
  }
  if (!b.contextBundle || typeof b.contextBundle !== "object") {
    return { error: "contextBundle required (object)" };
  }
  return {
    mode: b.mode,
    messageText: b.messageText,
    contextBundle: b.contextBundle as Record<string, unknown>,
  };
}

function buildUserPrompt(
  mode: "extract" | "conversational",
  messageText: string,
  bundle: Record<string, unknown>,
): string {
  const header =
    mode === "extract" ? "## MESSAGE DU THERMICIEN" : "## QUESTION DU THERMICIEN";
  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    header,
    messageText,
    "",
    "Produis le tool-call propose_visit_patches.",
  ].join("\n");
}

function errorResp(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error_code: code,
      error_message: message,
      retryable: status === 429 || status === 504 || status === 502,
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
