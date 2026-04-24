/**
 * VTU — Edge Function `update-json-state`
 *
 * Itération 6 (Phase 1) : SCAFFOLD fire-and-forget.
 * Ne mute PAS encore le `visit_json_state`. La logique réelle (appel
 * IA → mutation versionnée + optimistic concurrency) arrive en Phase 2.
 *
 * Contrat actuel :
 *   POST { visit_id: string, message_id: string }
 *   → 200 { ok: true, scaffold: true }
 *
 * Sécurité :
 *   - JWT requis (verify_jwt = true par défaut Supabase Edge).
 *   - On vérifie via supabase.auth.getUser() que le caller est connu,
 *     sinon 401.
 */

// @ts-expect-error — Deno runtime resolves remote URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Deno globals available at runtime in Supabase Edge Functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  visit_id?: unknown;
  message_id?: unknown;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_PUBLISHABLE_KEY =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!isUuid(body.visit_id) || !isUuid(body.message_id)) {
    return json({ error: "visit_id and message_id must be UUIDs" }, 400);
  }

  // Phase 1 : on ne fait que logger et acquitter. Phase 2 branchera l'IA.
  console.log(
    `[update-json-state] scaffold call by user=${userData.user.id} visit=${body.visit_id} message=${body.message_id}`,
  );

  return json({ ok: true, scaffold: true }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
