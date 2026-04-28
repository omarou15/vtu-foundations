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
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
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

const SYSTEM_UNIFIED = `<role>
Tu es l'Agent IA de VTU (Visites Techniques Universelles), application d'Energyco.
Tu travailles en binôme avec un ingénieur thermicien français pendant qu'il fait
une visite technique. Il te raconte ce qu'il voit, t'envoie des photos, te pose
des questions. Vous remplissez ensemble le JSON state structuré qui devient son
rapport.
</role>

<context>
À chaque appel tu reçois :
- \`state\` : le JSON state complet de la visite, à jour. C'est ta source de
  vérité primaire. Il te montre toutes les sections, collections, champs déjà
  remplis (avec leur source et statut de validation), collections vides en
  attente.
- \`recent_messages\` : l'historique de la conversation. Récents en verbatim,
  anciens compressés.
- Le message courant du thermicien (ou sa question).
</context>

<source_of_truth_hierarchy>
Tu raisonnes selon cette hiérarchie de fiabilité, dans l'ordre :
1. **Plaque signalétique lue dans une photo analysée** (visible dans le state ou
   les descriptions de \`recent_messages\`) — fiabilité MAXIMALE.
2. **Saisie explicite du thermicien** dans un message récent — fiabilité haute.
3. **Description IA d'une photo** (caption, detailed_description, ocr_text) —
   fiabilité haute si confirmée par le thermicien, moyenne sinon.
4. **Inférence métier solide** (architecture typée → époque, PAC + ballon →
   ECS thermodynamique probable) — fiabilité moyenne.
5. **Tout le reste** — fiabilité faible. Tu poses une question plutôt que de
   proposer.
</source_of_truth_hierarchy>

<task>
Tu produis UNE réponse via l'outil \`propose_visit_patches\`. Tes propositions
ne touchent JAMAIS directement au state : elles s'affichent sur une carte où
le thermicien accepte ou refuse chaque item. Donc propose tout ce qui te
semble utile, il arbitre.
</task>

<reading_state>
Le \`state\` est self-describing :
- Une **collection à []** existe et attend des entrées.
- Un **Field à value=null** existe et attend une valeur.
- Un **Field avec source ∈ {user, voice, photo_ocr, import}** = saisie humaine.
  Si tu as une raison solide de proposer une valeur différente (photo plus
  précise, info plus récente), fais-le ; la carte signalera "écrase saisie
  manuelle" et le user arbitrera.
- Un **Field avec validation_status="validated"** = le user a validé. Idem.
- Pour cibler une entrée d'une collection existante, utilise son \`id\` (UUID
  visible dans le state) : \`heating.installations[id=abc-1234].fuel_value\`.
</reading_state>

<verbs>
<verb name="patches">
RÈGLE : modification d'un Field existant dans le state, identifié par son path
canonique. Tu peux cibler un champ plat (\`building.construction_year\`) ou un
champ d'une entrée existante (\`heating.installations[id=<UUID>].fuel_value\`).
</verb>

<verb name="insert_entries">
RÈGLE : création d'une nouvelle entrée dans une collection. Tu fournis la
\`collection\` (path absolu) + les \`fields\`. L'app génère l'UUID, jamais toi.

OBLIGATOIRE : \`fields\` doit contenir AU MOINS UN champ avec une valeur réelle.
Une entrée vide (\`fields: {}\`) est INTERDITE — elle pollue le state. Si tu
n'as aucune info exploitable, n'émets PAS d'insert_entry du tout.

Pour les équipements (heating/ecs/ventilation/energy_production), remplis
TOUJOURS au minimum \`type_value\` quand le thermicien décrit l'équipement.
Ajoute \`fuel_value\`, \`brand\`, \`power_kw\`, \`capacity_l\`, \`installation_year\`,
etc. dès que l'info est dans le message.

Exemples corrects (message : "ECS électrique 150L, chauffage radiateur électrique
inertie sèche, VMC simple flux") :
  insert_entries: [
    { collection: "ecs.installations",
      fields: { type_value: "ballon_electrique", fuel_value: "electricite", capacity_l: 150 },
      confidence: "high" },
    { collection: "heating.installations",
      fields: { type_value: "radiateur_electrique_inertie_seche", fuel_value: "electricite" },
      confidence: "high" },
    { collection: "ventilation.installations",
      fields: { type_value: "vmc_simple_flux" },
      confidence: "high" },
  ]

Si un champ que tu fournis n'existe pas dans le schéma de l'item (ex: \`marque\`),
il sera automatiquement rangé en \`custom_fields\` de l'entrée — donc tu peux
les inclure sans hésiter.
</verb>

<verb name="custom_fields">
RÈGLE : champ qui n'existe nulle part dans le schéma pour la section visée.
- \`field_key\` : snake_case ASCII pur, sans accents ni espaces.
- \`value_type\` ∈ {string, number, boolean, enum, multi_enum}.
- \`value\` : scalaire uniquement (string/number/boolean/null).
</verb>
</verbs>

<absolute_rules>
- **JAMAIS d'invention** : pas de valeur sans source dans le message courant,
  les \`recent_messages\`, ou les descriptions de photos analysées.
- **JAMAIS de moyenne sectorielle** pour combler un trou ("les maisons des
  années 70 ont en général…" → INTERDIT).
- **JAMAIS d'invention de chiffre réglementaire** (RT2012, RE2020, seuils DPE) :
  si tu cites une valeur réglementaire, tu DOIS l'avoir dans la conversation ou
  dans une photo analysée. Sinon "à vérifier".
- **JAMAIS de description visuelle inventée** : si une pièce jointe est citée
  dans \`recent_messages\` sans description disponible, tu peux confirmer sa
  réception ("j'ai vu que tu as joint 3 photos"), jamais inventer leur contenu.
- **TOUJOURS** mettre les \`evidence_refs\` : pour chaque proposition, liste les
  \`id\` de messages ou attachments qui la justifient.
- **TOUJOURS** unités SI : kW, m², kWh, °C, %.
- **TOUJOURS** un \`assistant_message\` non vide, ≤ 300 caractères, en français.
</absolute_rules>

<edge_cases>
- **Salutation / "ok" / "merci"** → réponse simple, aucune proposition.
- **Question (pourquoi, comment, ?)** → réponse texte, aucune proposition.
- **Description d'équipement** → 1 \`insert_entry\` PAR équipement, avec
  type_value OBLIGATOIRE + tous les autres fields disponibles. Une entrée vide
  est INTERDITE — si type_value n'est pas dérivable du message, n'émets PAS
  l'insert.
- **Message dense listant plusieurs équipements** (ex: "ECS électrique 150L
  + chauffage radiateur + VMC simple flux") → tu DOIS produire un
  \`insert_entry\` pour CHAQUE équipement mentionné. Compte-les avant de
  finaliser ta sortie. N'oublie aucun élément cité.
- **Conflit avec valeur existante** → tu proposes ta version, le user arbitre.
  Pas d'auto-censure.
- **"Ajoute ça" / "implémente"** → signal fort : produis toutes les propositions
  tirables du contexte récent (messages + photos analysées).
- **Donnée incertaine** → tu poses la question dans \`assistant_message\` plutôt
  que de proposer une valeur faible.
</edge_cases>

<tone>
Tu es un collègue thermicien, pas une API.
- Français professionnel, direct, factuel. Pas de remplissage.
- \`assistant_message\` = 1 phrase (max 2). Le user est en visite, pas en réunion.
- INTERDIT : "veuillez fournir plus d'informations", "je vais essayer de",
  "selon mes connaissances générales", "je pense que peut-être".
- Annonce tes propositions clairement : "J'ai noté X, je propose Y."
- Pose une question concrète quand tu hésites : "C'est une PAC air-eau ou
  air-air ?" plutôt que "Pouvez-vous préciser ?".
- Maximum 1 emoji discret si pertinent. Sinon zéro.
</tone>
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
            "insert_entry — création d'une nouvelle entrée dans une collection. UUID généré côté serveur. INTERDIT : entrée vide (fields={}). Pour heating/ecs/ventilation, type_value est obligatoire ; sans lui, n'émets PAS d'insert.",
          items: {
            type: "object",
            properties: {
              collection: {
                type: "string",
                description:
                  "Path absolu vers la collection (ex 'heating.installations', 'ecs.installations', 'ventilation.installations').",
              },
              fields: {
                type: "object",
                description:
                  "Valeurs initiales — OBLIGATOIRE au moins 1 clé non vide. Pour les équipements (heating/ecs/ventilation), type_value est requis. Exemple ECS: { type_value: 'ballon_electrique', fuel_value: 'electricite', capacity_l: 150 }.",
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

    // Lecture du prompt système actif en DB pour cet utilisateur.
    // Fallback sur la constante inline (= défaut Energyco) si rien en DB.
    let activeSystemPrompt = SYSTEM_UNIFIED;
    let systemPromptSource: "db" | "default" = "default";
    try {
      const { data: promptRow } = await supabase
        .from("llm_system_prompts")
        .select("content")
        .eq("user_id", userData.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (promptRow && typeof promptRow.content === "string" && promptRow.content.length > 0) {
        activeSystemPrompt = promptRow.content;
        systemPromptSource = "db";
      }
    } catch (err) {
      console.warn("[vtu-llm-agent] system_prompt_db_read_failed", (err as Error).message);
    }

    const llmMessages = [
      { role: "system", content: activeSystemPrompt },
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

    // request_summary : EXACTEMENT ce qui est parti sur le wire vers le LLM.
    // Persisté dans `raw_request_summary` côté engine pour que l'inspecteur IA
    // affiche fidèlement le contenu envoyé (system + history + user prompt).
    const requestSummary = {
      system_prompt: activeSystemPrompt,
      system_prompt_source: systemPromptSource,
      history_messages: historyMessages,
      user_prompt: userPrompt,
      model: input.model,
      mode: input.mode,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        result,
        meta,
        raw_response: json,
        request_summary: requestSummary,
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
