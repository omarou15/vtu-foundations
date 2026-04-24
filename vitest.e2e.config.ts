/**
 * VTU — Configuration Vitest E2E (Itération 6).
 *
 * Cette suite est SÉPARÉE de `vitest.config.ts` pour deux raisons :
 *  1. Elle parle au vrai Supabase (RLS testée en condition réelle), donc
 *     elle nécessite des credentials et n'est pas safe à lancer en CI
 *     sans configuration explicite.
 *  2. Elle utilise l'environnement `node` (pas happy-dom) — pas besoin
 *     de DOM, juste fetch + le client Supabase.
 *
 * Lancement :
 *   bunx vitest run --config vitest.e2e.config.ts
 *
 * Variables requises (via .env.test, JAMAIS commitées) :
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_PUBLISHABLE_KEY
 *   - VTU_E2E_USER_A_EMAIL / VTU_E2E_USER_A_PASSWORD
 *   - VTU_E2E_USER_B_EMAIL / VTU_E2E_USER_B_PASSWORD
 *
 * Si l'une manque, les tests sont automatiquement SKIPPÉS (cf. e2e/setup.ts).
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.e2e.{test,spec}.ts"],
    exclude: ["node_modules", "dist", ".lovable", ".vinxi"],
    css: false,
    // Plus long : on parle au vrai backend.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
