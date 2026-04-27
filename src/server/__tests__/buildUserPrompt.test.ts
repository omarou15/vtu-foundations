/**
 * It. 14.1 — Garde anti-hallucination dans les prompts user.
 */
import { describe, expect, it } from "vitest";
import {
  buildPendingAttachmentsGuard,
  buildUserPromptConversational,
  buildUserPromptExtract,
} from "@/server/llm.prompt-builders";

const baseBundle = {
  schema_version: 2,
  visit: { id: "v1", mission_type: null, building_type: null },
  state_summary: {},
  recent_messages: [],
  attachments_context: [],
  nomenclature_hints: {},
};

describe("buildPendingAttachmentsGuard", () => {
  it("retourne '' si aucun pending", () => {
    expect(buildPendingAttachmentsGuard({ pending_attachments: [] }, "extract")).toBe("");
    expect(buildPendingAttachmentsGuard({}, "conversational")).toBe("");
  });

  it("inclut bloc + règle stricte si ≥1 pending (conversational)", () => {
    const out = buildPendingAttachmentsGuard(
      {
        pending_attachments: [
          { id: "a1", media_profile: "photo", reason: "no_description_yet" },
        ],
      },
      "conversational",
    );
    expect(out).toContain("ATTACHMENTS NON ENCORE ANALYSÉS");
    expect(out).toContain("tu NE DOIS PAS prétendre");
    expect(out).toContain("a1 (photo) — no_description_yet");
    expect(out).toContain("[conversational]");
  });

  it("inclut interdiction patches/custom_fields en mode extract", () => {
    const out = buildPendingAttachmentsGuard(
      {
        pending_attachments: [
          { id: "a2", media_profile: null, reason: "ai_disabled_when_sent" },
        ],
      },
      "extract",
    );
    expect(out).toContain("AUCUN patch");
    expect(out).toContain("evidence_refs");
    expect(out).toContain("ai_disabled_when_sent");
  });
});

describe("buildUserPromptConversational", () => {
  it("contient la garde si pending_attachments non vide", () => {
    const prompt = buildUserPromptConversational("Tu as reçu mes photos ?", {
      ...baseBundle,
      pending_attachments: [
        { id: "a1", media_profile: "photo", reason: "no_description_yet" },
      ],
    });
    expect(prompt).toContain("ATTACHMENTS NON ENCORE ANALYSÉS");
    expect(prompt).toContain("QUESTION DU THERMICIEN");
  });

  it("n'inclut PAS la garde si pending_attachments vide", () => {
    const prompt = buildUserPromptConversational("ok", {
      ...baseBundle,
      pending_attachments: [],
    });
    expect(prompt).not.toContain("ATTACHMENTS NON ENCORE ANALYSÉS");
  });
});

describe("buildUserPromptExtract", () => {
  it("contient la garde extract-spécifique", () => {
    const prompt = buildUserPromptExtract("VMC SF, R+2", {
      ...baseBundle,
      pending_attachments: [
        { id: "a1", media_profile: "photo", reason: "no_description_yet" },
      ],
    });
    expect(prompt).toContain("AUCUN patch");
    expect(prompt).toContain("MESSAGE UTILISATEUR");
  });

  it("absence de garde si pas de pending", () => {
    const prompt = buildUserPromptExtract("hello", {
      ...baseBundle,
      pending_attachments: [],
    });
    expect(prompt).not.toContain("AUCUN patch");
  });
});
