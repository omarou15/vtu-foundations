/**
 * Tests Itération 5 — store Zustand toggle IA per visit_id.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "@/features/chat";

beforeEach(() => {
  useChatStore.getState().reset();
});

describe("useChatStore — toggle IA per visit_id", () => {
  it("default: IA off pour toute visite", () => {
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(false);
  });

  it("setAiEnabled persiste la valeur par visit_id (isolé)", () => {
    useChatStore.getState().setAiEnabled("v1", true);
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(true);
    expect(useChatStore.getState().isAiEnabled("v2")).toBe(false);
  });

  it("toggleAi inverse la valeur par visit_id", () => {
    useChatStore.getState().toggleAi("v1");
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(true);
    useChatStore.getState().toggleAi("v1");
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(false);
  });

  it("reset vide tout le store", () => {
    useChatStore.getState().setAiEnabled("v1", true);
    useChatStore.getState().setAiEnabled("v2", true);
    useChatStore.getState().reset();
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(false);
    expect(useChatStore.getState().isAiEnabled("v2")).toBe(false);
  });
});
