/**
 * Tests Itération 5 + 11.7 — store Zustand toggle IA per visit_id +
 * kill-switch global et sélection de modèle.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "@/features/chat";

beforeEach(() => {
  useChatStore.getState().reset();
});

describe("useChatStore — toggle IA per visit_id", () => {
  it("default: IA off pour toute visite (per-visit non activé)", () => {
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

  it("kill-switch global : si OFF, isAiEnabled retourne false même si per-visit ON", () => {
    useChatStore.getState().setAiEnabled("v1", true);
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(true);
    useChatStore.getState().setAiGlobalEnabled(false);
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(false);
    useChatStore.getState().setAiGlobalEnabled(true);
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(true);
  });

  it("setSelectedModel met à jour le tier", () => {
    useChatStore.getState().setSelectedModel("premium");
    expect(useChatStore.getState().selectedModel).toBe("premium");
  });

  it("reset rétablit les défauts (global ON, model standard, per-visit vide)", () => {
    useChatStore.getState().setAiEnabled("v1", true);
    useChatStore.getState().setAiGlobalEnabled(false);
    useChatStore.getState().setSelectedModel("premium");
    useChatStore.getState().reset();
    expect(useChatStore.getState().isAiEnabled("v1")).toBe(false);
    expect(useChatStore.getState().aiGlobalEnabled).toBe(true);
    expect(useChatStore.getState().selectedModel).toBe("standard");
  });
});
