/**
 * VTU — Edge Function `vtu-llm-agent` (It. 10.5 + It. 11.6 — 3 verbes)
 *
 * Remplace les server functions TanStack `extractFromMessage` et
 * `conversationalQuery`. Latence cible <8s perçus (vs ~50s en TanStack).
 *
 * Input (JSON) :
 *  {
 *    mode: "extract" | "conversational",
 *    messageText: string,
 *    contextBundle: ContextBundle  // sérialisé tel quel (inclut schema_map)
 *  }
 *
 * Output (JSON) sur 200 :
 *  {
 *    ok: true,
 *    result: {
 *      assistant_message: string,
 *      patches: AiFieldPatch[],         // set_field (path connu)
 *      insert_entries: AiInsertEntry[], // création d'entrée de collection
 *      custom_fields: AiCustomField[],  // vocabulaire émergent
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

const SYSTEM_UNIFIED = `# VTU — Cerveau IA Thermicien (mode unifié, 3 verbes)

Tu es le **collègue IA** d'un thermicien expert en visite terrain. Tu
réponds toujours comme un humain qui parle à un humain — pas comme une
API. Le ContextBundle te donne l'état actuel de la VT, les derniers
messages, les descriptions des médias rattachés, et la \`schema_map\`
qui te dit EXACTEMENT quels paths/collections sont valides.

## TA SORTIE (TOUJOURS via le tool propose_visit_patches)

1. **assistant_message** (string, ≤300 chars) — OBLIGATOIRE, JAMAIS vide.
   - Extraction → annonce : "J'ai relevé une PAC air-eau et 2 pathologies, vérifie les propositions."
   - Question (résume, explique, comment, ?) → réponse ≤2 phrases factuelles.
   - Salutation / message court → réponse de collègue ("Bonjour ! Décris ce que tu observes et je structurerai tes infos.").
   - INTERDIT : "Aucun champ mis à jour", "Je n'ai rien extrait", "Veuillez fournir plus d'informations".
   - **INTERDIT SYMÉTRIQUE — RÈGLE DE NON-MENSONGE** : tu N'AS PAS LE DROIT
     d'écrire "j'ai ajouté/noté/enregistré/complété/inséré/créé X" sans
     produire EN MÊME TEMPS le patches/insert_entries/custom_fields
     correspondant. Si tu n'arrives pas à structurer une opération valide,
     dis-le honnêtement ("Je n'arrive pas à le structurer, peux-tu préciser…").

2. **patches** (array) — set_field sur un Field<T> EXISTANT du schéma.
   - Path syntaxe acceptée :
     a) Object field plat : path ∈ schema_map.object_fields
        Ex: "building.wall_material_value", "envelope.murs.material_value"
     b) Field d'une entrée existante : path = "<collection>[id=<UUID>].<field>"
        L'UUID DOIT figurer dans schema_map.collections[<c>].entries_summary.
        Ex: "heating.installations[id=abc-1234].fuel_value"
   - INTERDIT ABSOLU — TON ERREUR LA PLUS FRÉQUENTE :
     • "heating.installations[0].type_value" → REJETÉ. JAMAIS d'index numérique.
     • Si entries_summary est VIDE pour une collection, tu NE PEUX PAS patcher
       d'entrée — tu DOIS produire un insert_entries.
     • Path absent de schema_map → REJETÉ. Utilise custom_fields.
   - INTERDIT GATE HUMAIN : si state_summary[path].source ∈ {user, voice,
     photo_ocr, import} ET state_summary[path].value !== null → ne pas patcher.
   - Champs : path, value, confidence ∈ {low, medium, high}, evidence_refs.

3. **insert_entries** (array) — création d'entrée dans une collection.
   - **RÈGLE DE DÉCISION** : si l'utilisateur décrit un équipement/pathologie/
     préconisation ET que entries_summary[collection] est VIDE
     (ou que rien n'y correspond), → produis UN insert_entries qui groupe
     TOUS les champs de cette entité, PAS plusieurs patches [0].
   - Champs :
     • collection : ∈ schema_map.collections (ex "heating.installations")
     • fields : { <key>: <value>, … } — chaque key DOIT ∈
       schema_map.collections[collection].item_fields.
       **OBLIGATOIRE : au moins 1 key.** Un insert_entries avec
       fields:{} est REJETÉ par l'apply layer.
     • confidence, evidence_refs
   - L'app génère l'UUID, pose tous les champs en source="ai_infer",
     validation_status="unvalidated".
   - **EXEMPLE CANONIQUE** — message: "PAC air-eau de 8kW électrique, marque Daikin"
     → schema_map.collections["heating.installations"].entries_summary == []
     → tu produis 1 SEUL insert_entries:
       { collection:"heating.installations",
         fields:{ type_value:"pac_air_eau", power_kw:8, fuel_value:"electricite",
                  brand:"Daikin" },
         confidence:"high" }
     → tu NE produis PAS de patches "heating.installations[0].xxx".

4. **custom_fields** (array) — vocabulaire ÉMERGENT, hors schéma.
   - field_key snake_case [a-z0-9_]+. À utiliser SEULEMENT si le concept
     n'est pas couvert par schema_map.

5. **warnings** (array de strings ≤200 chars).

6. **confidence_overall** ∈ [0,1].

## RÈGLES DURES

- Pas d'invention. Pas de moyenne sectorielle pour combler un trou.
- Si la donnée est explicite → opération adéquate, même en low.
- Unités SI obligatoires (m², kW, kWh, °C, %).
- Tone direct, factuel, pro, en français. Maximum 1 émoji discret si pertinent.

## ANTI-HALLUCINATION ATTACHMENTS (CRITIQUE)

Le ContextBundle peut contenir un tableau \`pending_attachments\` listant
des pièces jointes que tu n'as PAS vues (analyse visuelle non terminée
ou désactivée par l'utilisateur).

- Tu n'as AUCUNE information sur leur contenu visuel.
- Tu peux confirmer leur réception (nombre, type), JAMAIS leur contenu.
- N'émets AUCUN patch / insert_entry / custom_field appuyé sur un \`pending_attachment\`.
- N'inscris JAMAIS un id \`pending_attachment\` dans \`evidence_refs\`.
- Si l'utilisateur te demande ce que tu vois sur ces fichiers, dis
  explicitement que l'analyse est en cours (ou que l'IA était désactivée
  à l'envoi) — JAMAIS "j'ai bien reçu et analysé".
- Si une pièce jointe n'a ni \`short_caption\` ni \`detailed_description\`
  ni \`ocr_text\` dans \`attachments_context\`, applique la même règle.
`;

// ---------------------------------------------------------------------------
// Tool schema — UnifiedAgentOutput (cf. src/shared/llm/schemas/extract.schema.ts)
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
            "set_field — modification d'un Field<T> existant. path ∈ schema_map.object_fields OU '<collection>[id=<UUID>].<field>'. PAS d'index positionnel.",
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
            "insert_entry — création d'une nouvelle entrée dans une collection connue. UUID généré côté serveur.",
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
                  "Valeurs initiales : keys DOIVENT ∈ schema_map.collections[collection].item_fields.",
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

    // --- Build user prompt + multi-turn history
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

    // Diagnostic — visible dans edge_function_logs
    console.log("[vtu-llm-agent] llm_request", JSON.stringify({
      mode: input.mode,
      history_count: historyMessages.length,
      user_message_preview: input.messageText.slice(0, 200),
    }));

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

    // Normalisation défensive
    const rawPatches = Array.isArray(parsed.patches) ? parsed.patches : [];
    const rawInserts = Array.isArray(parsed.insert_entries) ? parsed.insert_entries : [];
    const rawCustom = Array.isArray(parsed.custom_fields) ? parsed.custom_fields : [];
    const rawWarnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    // Diagnostic — visible dans edge_function_logs
    console.log("[vtu-llm-agent] llm_raw_output", JSON.stringify({
      patches_count: rawPatches.length,
      insert_entries_count: rawInserts.length,
      custom_fields_count: rawCustom.length,
      assistant_message_preview: typeof parsed.assistant_message === "string"
        ? parsed.assistant_message.slice(0, 120)
        : null,
      raw_insert_entries: rawInserts.slice(0, 5),
      raw_patches_paths: rawPatches
        .map((p) => (p && typeof p === "object" ? (p as { path?: unknown }).path : null))
        .filter((x) => typeof x === "string")
        .slice(0, 10),
    }));

    // It. 11.6 hardening — coalesce des patches "<collection>[N].<field>" en
    // insert_entry quand la collection existe dans schema_map. Filet de
    // sécurité contre la confusion fréquente du LLM (préfère [0] à insert_entry
    // quand entries_summary est vide). L'apply layer reste strict.
    const schemaMap = (input.contextBundle as { schema_map?: { collections?: Record<string, unknown> } })
      .schema_map;
    const knownCollections = new Set(Object.keys(schemaMap?.collections ?? {}));
    const { patches, insertEntries: insertEntriesAfterCoalesce, coalescedWarnings } = coalescePositionalPatches(
      rawPatches,
      rawInserts,
      knownCollections,
    );

    // It. 11.6 hardening — filtrer les insert_entries avec fields vide
    // OU collection inconnue (le LLM le fait parfois). Logger précisément
    // la raison pour debug.
    interface DropDiag { collection: string; reason: "fields_empty" | "collection_unknown" }
    const dropDiags: DropDiag[] = [];
    const insertEntries = insertEntriesAfterCoalesce.filter((e) => {
      const collection = String((e as { collection?: unknown }).collection ?? "?");
      const f = (e as { fields?: unknown }).fields;
      const hasFields = !!f && typeof f === "object" && Object.keys(f as Record<string, unknown>).length > 0;
      if (!knownCollections.has(collection)) {
        dropDiags.push({ collection, reason: "collection_unknown" });
        return false;
      }
      if (!hasFields) {
        dropDiags.push({ collection, reason: "fields_empty" });
        return false;
      }
      return true;
    });

    if (dropDiags.length > 0) {
      console.warn("[vtu-llm-agent] insert_entries_dropped", JSON.stringify(dropDiags));
    }

    // Garde anti-hallucination réciproque, version fine :
    // - llmProducedOps : ce que le LLM a réellement émis (avant nos filtres).
    // - effectiveOps   : ce qui survit après filtrage.
    // Trois cas distincts, trois messages distincts.
    const llmProducedOps = rawPatches.length + rawInserts.length + rawCustom.length;
    const effectiveOps = patches.length + insertEntries.length + rawCustom.length;
    const rawMessage = typeof parsed.assistant_message === "string"
      ? parsed.assistant_message
      : "";
    const claimsAction = /j['’]ai (ajouté|noté|enregistré|complété|relevé|mis|inséré|créé|sauvegardé)/i.test(rawMessage);

    let safeMessage: string;
    let hallucinationTag: string | null = null;
    if (effectiveOps > 0) {
      // Cas nominal : on garde le message du LLM tel quel.
      safeMessage = rawMessage.length > 0 ? rawMessage.slice(0, 400) : "Bien noté.";
    } else if (llmProducedOps > 0 && dropDiags.length > 0) {
      // Le LLM a tenté d'agir mais on a tout filtré → message précis.
      const unknownCols = dropDiags.filter((d) => d.reason === "collection_unknown").map((d) => d.collection);
      const emptyCols = dropDiags.filter((d) => d.reason === "fields_empty").map((d) => d.collection);
      const hints: string[] = [];
      if (unknownCols.length > 0) hints.push(`catégorie inconnue (${[...new Set(unknownCols)].join(", ")})`);
      if (emptyCols.length > 0) hints.push("aucun champ exploitable détecté");
      safeMessage = `Je n'ai pas pu structurer ces infos : ${hints.join(" et ")}. Précise le type d'équipement et au moins une caractéristique (ex : 'PAC air-eau Daikin 8 kW électrique').`;
      hallucinationTag = "filtered_after_llm";
    } else if (claimsAction) {
      // Le LLM affirme avoir agi mais n'a rien émis du tout.
      safeMessage = "Je n'ai pas pu structurer ces infos automatiquement. Reformule-les en précisant le type d'équipement et ses caractéristiques (ex : 'PAC air-eau Daikin 8 kW électrique').";
      hallucinationTag = "claimed_action_no_ops";
    } else {
      // Réponse conversationnelle légitime sans op.
      safeMessage = rawMessage.length > 0 ? rawMessage.slice(0, 400) : "Bien noté.";
    }

    const droppedWarnings = dropDiags.map(
      (d) => `insert_entry ignoré (collection=${d.collection}, raison=${d.reason})`,
    );
    const finalWarnings = hallucinationTag
      ? [...rawWarnings, ...coalescedWarnings, ...droppedWarnings, `assistant_message_rewritten:${hallucinationTag}`]
      : [...rawWarnings, ...coalescedWarnings, ...droppedWarnings];

    if (hallucinationTag) {
      console.warn("[vtu-llm-agent] assistant_message_rewritten", JSON.stringify({
        tag: hallucinationTag,
        original_message: rawMessage.slice(0, 200),
        llm_produced_ops: llmProducedOps,
        effective_ops: effectiveOps,
        drop_diags: dropDiags,
      }));
    }

    const result = {
      assistant_message: safeMessage,
      patches,
      insert_entries: insertEntries,
      custom_fields: rawCustom,
      warnings: finalWarnings,
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

  // It. 14.1 — Bloc anti-hallucination explicite (en plus du system prompt).
  const pending = Array.isArray((bundle as { pending_attachments?: unknown }).pending_attachments)
    ? ((bundle as { pending_attachments: Array<{ id: string; media_profile: string | null; reason: string }> }).pending_attachments)
    : [];
  const guardBlock =
    pending.length > 0
      ? [
          "",
          "## ATTACHMENTS NON ENCORE ANALYSÉS",
          "Les pièces jointes suivantes ont été reçues mais leur analyse",
          "visuelle n'est PAS disponible dans ce contexte :",
          ...pending.map(
            (p) => `  - ${p.id} (${p.media_profile ?? "?"}) — ${p.reason}`,
          ),
          "RÈGLE STRICTE : tu NE DOIS PAS prétendre avoir vu, lu ou analysé",
          "ces fichiers. Confirme leur réception (nombre, type), jamais leur",
          "contenu. N'émets AUCUN patch / custom_field / evidence_ref qui",
          "s'appuie sur un id ci-dessus.",
          "",
        ].join("\n")
      : "";

  return [
    "## CONTEXT BUNDLE",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    guardBlock,
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

// ---------------------------------------------------------------------------
// It. 11.6 hardening — coalesce des patches positionnels en insert_entries
// ---------------------------------------------------------------------------
// Le LLM (Gemini Flash) confond souvent `insert_entry` avec une série de
// patches `<collection>[N].<field>`. L'apply layer rejette ces patches
// (`positional_index_forbidden`) avec une UX cassée. On normalise ici :
// si plusieurs patches ciblent la même `<collection>[N]` ET que `collection`
// est connue de `schema_map.collections`, on les regroupe en 1 insert_entry.
// Les patches restants (path positionnel sur collection inconnue, ou patch
// d'object_field plat) sont conservés tels quels — l'apply layer décidera.
// ---------------------------------------------------------------------------

interface RawPatch {
  path?: unknown;
  value?: unknown;
  confidence?: unknown;
  evidence_refs?: unknown;
}

interface RawInsert {
  collection?: unknown;
  fields?: unknown;
  confidence?: unknown;
  evidence_refs?: unknown;
}

const POSITIONAL_RE = /^([a-z0-9_.]+)\[(\d+)\]\.([a-z0-9_]+)$/;

function coalescePositionalPatches(
  rawPatches: unknown[],
  rawInserts: unknown[],
  knownCollections: Set<string>,
): {
  patches: RawPatch[];
  insertEntries: RawInsert[];
  coalescedWarnings: string[];
} {
  const keptPatches: RawPatch[] = [];
  const insertEntries: RawInsert[] = rawInserts.filter(
    (e): e is RawInsert => !!e && typeof e === "object",
  );
  const coalescedWarnings: string[] = [];

  // Bucket : "<collection>#<index>" → { collection, fields, confidences[], evidence[] }
  const buckets = new Map<
    string,
    {
      collection: string;
      fields: Record<string, unknown>;
      confidences: string[];
      evidence: string[];
    }
  >();

  for (const raw of rawPatches) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as RawPatch;
    const path = typeof p.path === "string" ? p.path : "";
    const m = path.match(POSITIONAL_RE);

    if (!m || !knownCollections.has(m[1])) {
      // Pas une expression positionnelle sur collection connue → on garde
      // tel quel (l'apply layer décidera).
      keptPatches.push(p);
      continue;
    }

    const [, collection, indexStr, field] = m;
    const key = `${collection}#${indexStr}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        collection,
        fields: {},
        confidences: [],
        evidence: [],
      };
      buckets.set(key, bucket);
    }
    bucket.fields[field] = p.value;
    if (typeof p.confidence === "string") bucket.confidences.push(p.confidence);
    if (Array.isArray(p.evidence_refs)) {
      for (const r of p.evidence_refs) {
        if (typeof r === "string") bucket.evidence.push(r);
      }
    }
  }

  for (const bucket of buckets.values()) {
    insertEntries.push({
      collection: bucket.collection,
      fields: bucket.fields,
      confidence: pickHighestConfidence(bucket.confidences),
      evidence_refs: Array.from(new Set(bucket.evidence)),
    });
    coalescedWarnings.push(
      `Patches positionnels regroupés en insert_entry sur "${bucket.collection}" (${Object.keys(bucket.fields).length} champs).`,
    );
  }

  return { patches: keptPatches, insertEntries, coalescedWarnings };
}

function pickHighestConfidence(values: string[]): string {
  if (values.includes("high")) return "high";
  if (values.includes("medium")) return "medium";
  if (values.includes("low")) return "low";
  return "medium";
}
