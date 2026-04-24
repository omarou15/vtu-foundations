/**
 * VTU — E2E RLS (Itération 6)
 *
 * Vérifie que les politiques RLS Supabase :
 *   1. Empêchent un user A de SELECT les visits/messages d'un user B
 *      (filtrage silencieux : 0 rows, pas 403).
 *   2. Empêchent un user A d'INSERT une visit avec user_id ≠ auth.uid()
 *      (violation WITH CHECK → erreur 42501 ou 23514 selon le backend).
 *
 * Skippé automatiquement si les credentials E2E ne sont pas fournis :
 * voir vitest.e2e.config.ts pour la liste des variables d'environnement.
 *
 * IMPORTANT : ces tests créent une visite côté user A pour vérifier que
 * user B ne la voit pas. Aucune mutation chez user B. À la fin, la visite
 * créée est supprimée (cleanup) — sinon on accumule de la donnée test.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const A_EMAIL = process.env.VTU_E2E_USER_A_EMAIL;
const A_PWD = process.env.VTU_E2E_USER_A_PASSWORD;
const B_EMAIL = process.env.VTU_E2E_USER_B_EMAIL;
const B_PWD = process.env.VTU_E2E_USER_B_PASSWORD;

const skip = !URL || !KEY || !A_EMAIL || !A_PWD || !B_EMAIL || !B_PWD;

const d = skip ? describe.skip : describe;

d("RLS cross-user (E2E)", () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userIdA: string;
  let userIdB: string;
  let createdVisitId: string | null = null;

  beforeAll(async () => {
    clientA = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientB = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: a, error: ea } = await clientA.auth.signInWithPassword({
      email: A_EMAIL!,
      password: A_PWD!,
    });
    if (ea || !a.user) throw new Error(`Login A failed: ${ea?.message}`);
    userIdA = a.user.id;

    const { data: b, error: eb } = await clientB.auth.signInWithPassword({
      email: B_EMAIL!,
      password: B_PWD!,
    });
    if (eb || !b.user) throw new Error(`Login B failed: ${eb?.message}`);
    userIdB = b.user.id;

    expect(userIdA).not.toBe(userIdB);
  });

  afterAll(async () => {
    // Best-effort cleanup
    if (createdVisitId) {
      await clientA.from("visits").delete().eq("id", createdVisitId);
    }
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  });

  it("user A peut INSERT une visit avec son propre user_id", async () => {
    const id = uuidv4();
    const client_id = uuidv4();
    const { error } = await clientA.from("visits").insert({
      id,
      user_id: userIdA,
      client_id,
      title: "E2E test visit",
      status: "draft",
      version: 1,
    });
    expect(error).toBeNull();
    createdVisitId = id;
  });

  it("user B ne voit PAS les visits de user A (filtre RLS silencieux)", async () => {
    const { data, error } = await clientB
      .from("visits")
      .select("id")
      .eq("user_id", userIdA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user B ne voit PAS la visit précise créée par A", async () => {
    if (!createdVisitId) throw new Error("setup failed");
    const { data, error } = await clientB
      .from("visits")
      .select("id")
      .eq("id", createdVisitId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user A ne peut PAS INSERT une visit avec user_id = user B (WITH CHECK)", async () => {
    const { error } = await clientA.from("visits").insert({
      id: uuidv4(),
      user_id: userIdB, // tentative d'usurpation
      client_id: uuidv4(),
      title: "should fail",
      status: "draft",
      version: 1,
    });
    expect(error).not.toBeNull();
    // Code Postgres pour violation de policy : "42501" (insufficient_privilege)
    // ou message "row-level security" / "violates row-level security"
    const msg = (error?.message ?? "").toLowerCase();
    expect(
      msg.includes("row-level") ||
        msg.includes("policy") ||
        error?.code === "42501",
    ).toBe(true);
  });

  it("user B ne voit PAS les messages de user A", async () => {
    const { data, error } = await clientB
      .from("messages")
      .select("id")
      .eq("user_id", userIdA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
