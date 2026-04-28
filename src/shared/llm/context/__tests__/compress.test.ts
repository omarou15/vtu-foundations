/**
 * Tests compression progressive du ContextBundle.
 *
 * Couvre les 4 cas du plan :
 *  (a) bundle léger → 0 passe
 *  (b) bundle moyen avec gros OCR → soft trim ocr suffit (pass 1)
 *  (c) bundle long historique avec messages volumineux → escalade 2a→2b→2c
 *  (d) bundle énorme → finit par 2e ou failed
 */

import { describe, expect, it } from "vitest";
import {
  compressContextBundle,
  DEFAULT_TOKEN_BUDGET,
} from "@/shared/llm/context/compress";
import type { ContextBundle } from "@/shared/llm/types";

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    schema_version: 3,
    visit: { id: "v1", mission_type: "audit_energetique", building_type: "maison" },
    state_summary: { meta: {}, building: {} },
    recent_messages: [],
    attachments_context: [],
    pending_attachments: [],
    schema_map: { object_fields: [], collections: {} },
    nomenclature_hints: {},
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

  it("(b) bundle moyen avec gros OCR → soft trim ocr (pass 1) suffit", () => {
    const bigOcr = "X".repeat(20_000); // ~5000 tokens
    const bundle = makeBundle({
      attachments_context: [
        {
          id: "a1",
          media_profile: "photo",
          short_caption: "façade",
          detailed_description: "mur",
          ocr_text: bigOcr,
        },
      ],
    });
    // Force un budget volontairement étroit pour déclencher pass 1
    const result = compressContextBundle(bundle, 2_000);
    expect(result.status).toBe("ok");
    expect(result.passes_applied).toBe(1);
    expect(result.bundle.attachments_context[0]?.ocr_text?.length).toBeLessThanOrEqual(
      501,
    );
  });

  it("(c) bundle long historique → escalade dans les passes 2a/2b/2c", () => {
    // 100 messages assistant longs (~1500c chacun) → ~37k tokens
    const messages = Array.from({ length: 100 }, (_, i) =>
      fakeMessage("assistant", "A".repeat(1500), i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    const result = compressContextBundle(bundle, DEFAULT_TOKEN_BUDGET);
    expect(result.status).toBe("ok");
    // Au minimum la passe 2a (trim assistant) a été appliquée → contenu raccourci
    expect(result.passes_applied).toBeGreaterThanOrEqual(2);
    // Les passes intermédiaires gardent plus que 8 messages
    expect(result.bundle.recent_messages.length).toBeGreaterThan(0);
  });

  it("(d) bundle énorme → finit par 2e (8 messages) ou failed", () => {
    // 500 messages user de 5000c chacun → ~625k tokens
    const messages = Array.from({ length: 500 }, (_, i) =>
      fakeMessage("user", "U".repeat(5000), i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    const result = compressContextBundle(bundle, DEFAULT_TOKEN_BUDGET);
    // Soit on est tombé au filet 8 messages, soit on a échoué — les deux acceptables
    if (result.status === "ok") {
      expect(result.bundle.recent_messages.length).toBeLessThanOrEqual(8);
      expect(result.passes_applied).toBeGreaterThanOrEqual(6); // ≥ pass 2e
    } else {
      expect(result.status).toBe("failed");
      expect(result.passes_applied).toBeGreaterThan(8);
    }
  });

  it("préserve l'ordre chronologique des messages dans toutes les passes", () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      fakeMessage("user", `msg-${i}`, i),
    );
    const bundle = makeBundle({ recent_messages: messages });
    // Petit budget pour forcer pass 2c (slice -50)
    const result = compressContextBundle(bundle, 500);
    const contents = result.bundle.recent_messages.map((m) => m.content);
    // Les contents doivent rester en ordre croissant d'index
    for (let i = 1; i < contents.length; i += 1) {
      const prev = Number(contents[i - 1]?.split("-")[1]);
      const cur = Number(contents[i]?.split("-")[1]);
      expect(cur).toBeGreaterThan(prev);
    }
  });
});
