/**
 * Tests user-prompt builders.
 *
 * Refonte avril 2026 — bundle minimal, plus de bloc anti-hallucination
 * dynamique. La garde est maintenant dans le prompt système.
 */
import { describe, expect, it } from "vitest";
import {
  buildUserPromptConversational,
  buildUserPromptExtract,
} from "@/server/llm.prompt-builders";

const baseBundle = {
  schema_version: 2,
  visit: { id: "v1", mission_type: null, building_type: null },
  state: { schema_version: 2, meta: {} },
  recent_messages: [],
};

describe("buildUserPromptExtract", () => {
  it("contient le header MESSAGE UTILISATEUR + le JSON bundle", () => {
    const prompt = buildUserPromptExtract("VMC SF, R+2", baseBundle);
    expect(prompt).toContain("MESSAGE UTILISATEUR");
    expect(prompt).toContain("CONTEXT BUNDLE");
    expect(prompt).toContain("VMC SF, R+2");
    expect(prompt).toContain("\"schema_version\"");
  });

  it("ne contient plus de bloc ATTACHMENTS NON ENCORE ANALYSÉS", () => {
    const prompt = buildUserPromptExtract("hello", baseBundle);
    expect(prompt).not.toContain("ATTACHMENTS NON ENCORE ANALYSÉS");
  });
});

describe("buildUserPromptConversational", () => {
  it("contient le header QUESTION DU THERMICIEN", () => {
    const prompt = buildUserPromptConversational("Quel est le PCI du gaz ?", baseBundle);
    expect(prompt).toContain("QUESTION DU THERMICIEN");
    expect(prompt).toContain("Quel est le PCI du gaz ?");
  });
});
