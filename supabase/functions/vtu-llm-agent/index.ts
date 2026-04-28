/**
 * VTU — Edge Function `vtu-llm-agent` (refonte avril 2026)
 *
 * Version "minimal context + total trust".
 *
 * Input (JSON) :
 *  {
 *    mode: "extract" | "conversational",
 *    messageText: string,
 *    contextBundle: { schema_version, visit, state, recent_messages },
 *    model?: string
 *  }
 *
 * Output (JSON) sur 200 :
 *  {
 *    ok: true,
 *    result: {
 *      assistant_message, patches, insert_entries, custom_fields,
 *      warnings, confidence_overall
 *    },
 *    meta: ProviderMeta,
 *    raw_response: object
 *  }
 *
 * Plus de coalescePositionalPatches, plus de dropDiags, plus de
 * hallucinationTag : on fait confiance au LLM. Toute proposition est
 * forwardée à l'app, qui la présente sur la carte d'actions au user.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const ALLOWED_MODELS = new Set<string>([
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "openai/gpt-5",
]);
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

Tu es le **collègue IA** d'un thermicien expert en visite terrain. Tu
réponds toujours comme un humain qui parle à un humain — pas comme une
API. Le ContextBundle te donne :
- \`schema_version\` (numéro de version du schéma JSON)
- \`visit\` (id, mission_type, building_type)
- \`state\` (la VisitJsonState COMPLÈTE — source de vérité)
- \`recent_messages\` (historique chat, y compris légendes de photos
  émises par l'IA)

Tu ne reçois PAS de schema_map ni de descriptions de pièces jointes
séparées : la structure du \`state\` te montre les sections existantes,
et les descriptions photos sont déjà dans les messages récents (rôle
\`assistant\`, kind \`photo_caption\` ou contenu d'analyse).

## SCHÉMA CANONIQUE DU JSON STATE

### Sections plates (Field<T> à modifier via patches)

- **meta** : title, mission_type_value, building_type_value,
  surface_total_m2, year_built, address, postal_code, city, etc.
- **building** : wall_material_value, roof_type_value, floors_count,
  occupants_count, etc.
- **envelope** : sous-objets \`murs\`, \`toiture\`, \`plancher_bas\`,
  \`menuiseries\`, chacun avec material_value, thickness_cm,
  insulation_value, condition_value.
- **heating** / **ecs** / **ventilation** / **energy_production** /
  **industriel_processes** / **tertiaire_hors_cvc** : contiennent
  chacun une **collection** \`installations\` (voir ci-dessous).
- **pathologies** / **preconisations** / **notes** /
  **custom_observations** : contiennent chacun une **collection**
  \`items\`.

### Collections (10) — création via insert_entries

Chaque entrée a un \`id\` (UUID, généré côté serveur) + les champs
listés. Les champs en \`*_value\` sont des Field<string> sémantiques ;
les \`*_other\` permettent une valeur libre hors enum.

1. \`heating.installations\` — type_value, fuel_value, brand,
   power_kw, installation_year, efficiency_pct
2. \`ecs.installations\` — type_value, fuel_value, brand, capacity_l,
   installation_year
3. \`ventilation.installations\` — type_value, brand,
   installation_year, flow_rate_m3_h
4. \`energy_production.installations\` — type_value, power_kw,
   installation_year
5. \`industriel_processes.installations\` — process_value, power_kw
6. \`tertiaire_hors_cvc.installations\` — category_value, power_kw
7. \`pathologies.items\` — category_value, description, severity_value
8. \`preconisations.items\` — category_value, description,
   priority_value, estimated_cost_eur
9. \`notes.items\` — content (Field<string>)
10. \`custom_observations.items\` — topic, content

## TA SORTIE (TOUJOURS via le tool \`propose_visit_patches\`)

1. **assistant_message** (string ≤300 chars) — OBLIGATOIRE, jamais vide.
   - Si tu produis des opérations : annonce-les naturellement
     ("J'ai noté une PAC air-eau et 2 pathologies, à toi de valider").
   - Si question / conversationnel : réponds en ≤2 phrases factuelles.
   - INTERDIT : "Aucun champ mis à jour", "Veuillez fournir plus".
   - INTERDIT SYMÉTRIQUE : ne dis pas "j'ai ajouté X" sans produire
     l'opération correspondante. Le user voit la carte d'actions.

2. **patches** (array) — set_field sur un Field<T>.
   - Path syntaxe :
     a) Object field plat : ex \`building.wall_material_value\`,
        \`envelope.murs.thickness_cm\`
     b) Field d'une entrée existante par UUID :
        \`<collection>[id=<UUID>].<field>\`
        Ex: \`heating.installations[id=abc-1234].fuel_value\`
   - **PRÉFÈRE** \`[id=<UUID>]\` à \`[N]\`. Si tu utilises \`[N]\`,
     l'app fera de son mieux pour résoudre l'index, mais c'est
     fragile.
   - Champs : \`path\`, \`value\`, \`confidence\` ∈ {low, medium, high},
     \`evidence_refs\` (optionnel).

3. **insert_entries** (array) — création d'entrée dans une collection.
   - À utiliser quand l'utilisateur décrit un équipement / pathologie
     / préconisation / note NOUVEAU.
   - Champs :
     • \`collection\` : un des 10 paths listés ci-dessus.
     • \`fields\` : { <key>: <value>, … } — au moins 1 clé.
     • \`confidence\`, \`evidence_refs\`.
   - L'app génère l'UUID et pose chaque champ en source="ai_infer",
     validation_status="unvalidated".
   - **Exemple canonique** — message: "PAC air-eau 8 kW Daikin"
     → 1 SEUL insert_entries :
     { collection: "heating.installations",
       fields: { type_value: "pac_air_eau", power_kw: 8,
                 fuel_value: "electricite", brand: "Daikin" },
       confidence: "high" }

4. **custom_fields** (array) — vocabulaire ÉMERGENT, hors schéma.
   - À utiliser SEULEMENT si le concept n'est pas couvert par le
     schéma ci-dessus. \`field_key\` snake_case [a-z0-9_]+.

5. **warnings** (array de strings ≤200 chars).

6. **confidence_overall** ∈ [0, 1].

## RÈGLES DURES

- Pas d'invention. Pas de moyenne sectorielle pour combler un trou.
- Si la donnée est explicite → opération adéquate, même en low.
- Unités SI obligatoires (m², kW, kWh, °C, %).
- Tone direct, factuel, pro, en français. Maximum 1 émoji discret.
- **RÉFÉRENCE PRONOMINALE** : si le user dit "ajoute ça", "note-le",
  les tours précédents sont fournis comme messages séparés. Tu DOIS
  résoudre le référent depuis ces tours. Si vraiment ambigu, demande
  une clarification — ne fabrique pas.

## CARTE D'ACTIONS (ce que voit le user)

L'utilisateur reçoit toutes tes propositions sur une carte. Il peut
accepter ou refuser chacune. Ton job : proposer ce qui te semble
juste avec une confidence honnête. C'est lui qui arbitre, pas toi.
- Si tu n'es pas sûr, propose en \`low\` plutôt que de t'abstenir.
- Si tu écrases peut-être une saisie humaine, propose quand même
  honnêtement — la carte préviendra le user.

## PHOTOS

Quand une photo a été analysée, sa description figure dans
\`recent_messages\` (rôle assistant). Exploite ces descriptions pour
proposer patches/insert_entries contextualisés. Si une photo n'a
PAS de description dans l'historique, tu ne peux RIEN affirmer sur
son contenu visuel — confirme la réception, jamais le contenu.
`;

// ---------------------------------------------------------------------------
// Tool schema — UnifiedAgentOutput
// ---------------------------------------------------------------------------

const PROPOSE_VISIT_PATCHES_TOOL = {
  type: "function",
  function: {
    name: "propose_visit_patches",
    description:
      "Produire un message humain pour le thermicien + (éventuels) patches set_field + insert_entries + custom_fields + warnings.",
    parameters: {
      type: "object",
      properties: {
        assistant_message: { type: "string" },
        patches: {
          type: "array",
          description:
            "set_field — modification d'un Field<T>. path = '<section>.<field>' OU '<collection>[id=<UUID>].<field>'.",
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
            "insert_entry — création d'une nouvelle entrée dans une collection. UUID généré côté serveur.",
          items: {
            type: "object",
            properties: {
              collection: {
                type: "string",
                description:
                  "Path absolu vers la collection (ex 'heating.installations').",
              },
              fields: {
                type: "object",
                description:
                  "Valeurs initiales : au moins 1 clé.",
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
          description:
            "custom_field — vocabulaire émergent hors schéma rigide.",
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

    const { userPrompt, historyMessages } = buildPromptAndHistory(
      input.mode,
      input.messageText,
      input.contextBundle,
    );

    const llmMessages = [
      { role: "system", content: SYSTEM_UNIFIED },
      ...historyMessages,
      { role: "user", content: userPrompt },
    ];

    console.log("[vtu-llm-agent] llm_request", JSON.stringify({
      mode: input.mode,
      model: input.model,
      history_count: historyMessages.length,
      user_message_preview: input.messageText.slice(0, 200),
    }));

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
          model: input.model,
          messages: llmMessages,
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

    // Normalisation défensive — on forward TOUT au client, sans filtre.
    // C'est l'app qui présente les propositions sur la carte d'actions
    // et le user qui arbitre.
    const patches = Array.isArray(parsed.patches) ? parsed.patches : [];
    const insertEntries = Array.isArray(parsed.insert_entries) ? parsed.insert_entries : [];
    const customFields = Array.isArray(parsed.custom_fields) ? parsed.custom_fields : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    const assistantMessage = typeof parsed.assistant_message === "string"
      ? parsed.assistant_message.slice(0, 400)
      : "Bien noté.";

    console.log("[vtu-llm-agent] llm_raw_output", JSON.stringify({
      patches_count: patches.length,
      insert_entries_count: insertEntries.length,
      custom_fields_count: customFields.length,
      assistant_message_preview: assistantMessage.slice(0, 120),
    }));

    const result = {
      assistant_message: assistantMessage,
      patches,
      insert_entries: insertEntries,
      custom_fields: customFields,
      warnings,
      confidence_overall:
        typeof parsed.confidence_overall === "number"
          ? parsed.confidence_overall
          : 0.5,
    };

    const latencyMs = Date.now() - t0;
    const usage = json?.usage ?? {};
    const meta = {
      provider: "lovable_gemini",
      model_version: json?.model ?? input.model,
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
  model: string;
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
  let resolvedModel = DEFAULT_MODEL;
  if (typeof b.model === "string" && b.model.length > 0) {
    if (ALLOWED_MODELS.has(b.model)) {
      resolvedModel = b.model;
    } else {
      console.warn(
        "[vtu-llm-agent] model_not_allowed_falling_back",
        JSON.stringify({ requested: b.model, fallback: DEFAULT_MODEL }),
      );
    }
  }
  return {
    mode: b.mode,
    messageText: b.messageText,
    contextBundle: b.contextBundle as Record<string, unknown>,
    model: resolvedModel,
  };
}

interface ChatMessage { role: "user" | "assistant"; content: string }

function buildPromptAndHistory(
  mode: "extract" | "conversational",
  messageText: string,
  bundle: Record<string, unknown>,
): { userPrompt: string; historyMessages: ChatMessage[] } {
  const header =
    mode === "extract" ? "## MESSAGE DU THERMICIEN" : "## QUESTION DU THERMICIEN";

  // Promote recent_messages en messages multi-tour.
  const recent = Array.isArray((bundle as { recent_messages?: unknown }).recent_messages)
    ? ((bundle as { recent_messages: Array<{ role?: unknown; content?: unknown; kind?: unknown }> }).recent_messages)
    : [];
  const historyMessages: ChatMessage[] = recent
    .filter((m) => {
      if (!m || typeof m !== "object") return false;
      const kind = typeof m.kind === "string" ? m.kind : "text";
      const role = m.role;
      const content = m.content;
      return (
        (kind === "text" || kind === "photo_caption") &&
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.length > 0
      );
    })
    .slice(-12)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 1000),
    }));
  if (
    historyMessages.length > 0 &&
    historyMessages[historyMessages.length - 1].role === "user" &&
    historyMessages[historyMessages.length - 1].content === messageText
  ) {
    historyMessages.pop();
  }

  // Bundle minus recent_messages (déjà promu en multi-tour).
  const bundleForPrompt = { ...bundle };
  delete (bundleForPrompt as { recent_messages?: unknown }).recent_messages;

  const userPrompt = [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundleForPrompt, null, 2),
    "```",
    "",
    header,
    messageText,
    "",
    "Produis le tool-call propose_visit_patches.",
  ].join("\n");

  return { userPrompt, historyMessages };
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
