/**
 * Setup global pour Vitest.
 *
 * - Polyfill IndexedDB via fake-indexeddb (Dexie nécessite IDB en
 *   environnement happy-dom/jsdom qui ne le fournit pas par défaut).
 * - Cleanup React après chaque test.
 */

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
