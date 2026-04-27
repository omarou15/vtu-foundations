/**
 * It. 10 — Tests context bundle + sérialisation stable + hash.
 *
 * Couvre :
 *  - stableSerialize : ordre des clés stable (même input → mêmes bytes).
 *  - hashContext : 2 inputs équivalents → même hash (cache prompt OK).
 *  - buildContextBundle : tronque les recent_messages au cap, attache
 *    descriptions IA, propage schema_version.
 */

import { describe, expect, it } from "vitest";
import { buildContextBundle } from "@/shared/llm/context/builder";
import { hashContext } from "@/shared/llm/context/hash";
import { stableSerialize } from "@/shared/llm/context/serialize-stable";
import type {
  MessageRow,
  VisitJsonStateRow,
  VisitRow,
} from "@/shared/types";

const VISIT: VisitRow = {
  id: "v1",
  user_id: "u1",
  client_id: "c1",
  title: "VT 1",
  status: "in_progress",
  version: 1,
  address: null,
  mission_type: "audit_energetique",
  building_type: "maison_individuelle",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const STATE_ROW: VisitJsonStateRow = {
  id: "s1",
  user_id: "u1",
  visit_id: "v1",
  version: 1,
  state: { schema_version: 2, meta: {} } as unknown as VisitJsonStateRow["state"],
  created_at: "2026-01-01T00:00:00.000Z",
  created_by_message_id: null,
  source_extraction_id: null,
};

function msg(id: string, content: string, createdAt: string): MessageRow {
  return {
    id,
    user_id: "u1",
    visit_id: "v1",
    client_id: id,
    role: "user",
    kind: "text",
    content,
    metadata: {},
    created_at: createdAt,
  };
}

describe("stableSerialize", () => {
  it("produit le même output quel que soit l'ordre des clés", () => {
    const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
    const b = { c: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(stableSerialize(a)).toBe(stableSerialize(b));
  });

  it("préserve l'ordre des tableaux (chronologie significative)", () => {
    expect(stableSerialize([3, 1, 2])).toBe("[3,1,2]");
    expect(stableSerialize([1, 2, 3])).toBe("[1,2,3]");
    expect(stableSerialize([3, 1, 2])).not.toBe(stableSerialize([1, 2, 3]));
  });

  it("null/undefined → 'null'", () => {
    expect(stableSerialize(null)).toBe("null");
    expect(stableSerialize(undefined)).toBe("null");
  });
});

describe("hashContext", () => {
  it("2 contextes bit-équivalents → MÊME hash (cache OK)", async () => {
    const c1 = { z: 1, a: { y: 2, x: 1 } };
    const c2 = { a: { x: 1, y: 2 }, z: 1 };
    const h1 = await hashContext(c1);
    const h2 = await hashContext(c2);
    expect(h1).toBe(h2);
    // SHA-256 = 64 hex chars
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("2 contextes différents → hashes différents", async () => {
    const h1 = await hashContext({ a: 1 });
    const h2 = await hashContext({ a: 2 });
    expect(h1).not.toBe(h2);
  });
});

describe("buildContextBundle", () => {
  it("tronque les recent_messages au cap (default 20)", () => {
    const messages: MessageRow[] = Array.from({ length: 30 }, (_, i) =>
      msg(`m${i}`, `content ${i}`, `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`),
    );
    const bundle = buildContextBundle({
      visit: VISIT,
      latestState: STATE_ROW,
      recentMessages: messages,
      attachmentDescriptions: [],
    });
    expect(bundle.recent_messages).toHaveLength(20);
    // garde les 20 derniers (par created_at asc → slice(-20))
    expect(bundle.recent_messages[0]?.content).toBe("content 10");
    expect(bundle.recent_messages[19]?.content).toBe("content 29");
  });

  it("respecte maxRecentMessages custom (8 pour LLM dispatch)", () => {
    const messages: MessageRow[] = Array.from({ length: 12 }, (_, i) =>
      msg(`m${i}`, `c${i}`, `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`),
    );
    const bundle = buildContextBundle({
      visit: VISIT,
      latestState: STATE_ROW,
      recentMessages: messages,
      attachmentDescriptions: [],
      maxRecentMessages: 8,
    });
    expect(bundle.recent_messages).toHaveLength(8);
  });

  it("propage schema_version depuis le state", () => {
    const bundle = buildContextBundle({
      visit: VISIT,
      latestState: STATE_ROW,
      recentMessages: [],
      attachmentDescriptions: [],
    });
    expect(bundle.schema_version).toBe(2);
  });

  it("attache les descriptions IA des attachments", () => {
    const bundle = buildContextBundle({
      visit: VISIT,
      latestState: STATE_ROW,
      recentMessages: [],
      attachmentDescriptions: [
        {
          attachment_id: "a1",
          media_profile: "photo",
          description: {
            short_caption: "façade nord",
            detailed_description: "mur enduit",
            structured_observations: [],
            ocr_text: null,
          },
        },
      ],
    });
    expect(bundle.attachments_context).toHaveLength(1);
    expect(bundle.attachments_context[0]?.short_caption).toBe("façade nord");
    expect(bundle.attachments_context[0]?.media_profile).toBe("photo");
  });

  it("hash du bundle stable entre 2 builds identiques (snapshot prompt)", async () => {
    const input = {
      visit: VISIT,
      latestState: STATE_ROW,
      recentMessages: [msg("m1", "salon", "2026-01-01T00:00:00.000Z")],
      attachmentDescriptions: [],
    };
    const b1 = buildContextBundle(input);
    const b2 = buildContextBundle(input);
    const h1 = await hashContext(b1);
    const h2 = await hashContext(b2);
    expect(h1).toBe(h2);
  });
});
