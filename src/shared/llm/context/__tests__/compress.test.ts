/**
 * Tests compression progressive du ContextBundle.
 *
 * Refonte avril 2026 — bundle minimal sans attachments_context. Les
 * passes OCR ont disparu. On teste la dégradation des messages.
 */

import { describe, expect, it } from "vitest";
import {
  compressContextBundle,
  DEFAULT_TOKEN_BUDGET,
} from "@/shared/llm/context/compress";
import type { ContextBundle } from "@/shared/llm/types";
import type { VisitJsonState } from "@/shared/types";

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    schema_version: 3,
    visit: { id: "v1", mission_type: "audit_energetique", building_type: "maison" },
    state: { schema_version: 3, meta: {} } as unknown as VisitJsonState,
    recent_messages: [],
    ...overrides,
  };
}

function fakeMessage(role: "user" | "assistant", content: string, i: number) {
  return {
    role,
    kind: "text",
    content,
    created_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
  };
}

describe("compressContextBundle — compression progressive", () => {
  it("(a) bundle léger → 0 passe appliquée, status ok", () => {
    const bundle = makeBundle({
      recent_messages: [fakeMessage("user", "salut", 0)],
    });
    const result = compressContextBundle(bundle);
    expect(result.status).toBe("ok");
    expect(result.passes_applied).toBe(0);
    expect(result.bundle.recent_messages).toHaveLength(1);
  });

  it("(b) bundle long historique assistant → escalade trim assistant + slice", () => {
    // 100 messages assistant longs (~1500c chacun) → ~37k tokens
    const messages = Array.from({ length: 100 }, (_, i) =>
      fakeMessage("assistant", "A".repeat(1500), i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    const result = compressContextBundle(bundle, DEFAULT_TOKEN_BUDGET);
    expect(result.status).toBe("ok");
    expect(result.passes_applied).toBeGreaterThanOrEqual(1);
    expect(result.bundle.recent_messages.length).toBeGreaterThan(0);
  });

  it("(c) bundle énorme → finit par hard-limit 8 messages ou failed", () => {
    // 500 messages user de 5000c chacun → ~625k tokens
    const messages = Array.from({ length: 500 }, (_, i) =>
      fakeMessage("user", "U".repeat(5000), i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    const result = compressContextBundle(bundle, DEFAULT_TOKEN_BUDGET);
    if (result.status === "ok") {
      expect(result.bundle.recent_messages.length).toBeLessThanOrEqual(50);
      expect(result.passes_applied).toBeGreaterThanOrEqual(3);
    } else {
      expect(result.status).toBe("failed");
      expect(result.passes_applied).toBeGreaterThan(6);
    }
  });

  it("préserve l'ordre chronologique des messages dans toutes les passes", () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      fakeMessage("user", `msg-${i}`, i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    // Petit budget pour forcer slice
    const result = compressContextBundle(bundle, 500);
    const contents = result.bundle.recent_messages.map((m) => m.content);
    for (let i = 1; i < contents.length; i += 1) {
      const prev = Number(contents[i - 1]?.split("-")[1]);
      const cur = Number(contents[i]?.split("-")[1]);
      expect(cur).toBeGreaterThan(prev);
    }
  });
});
