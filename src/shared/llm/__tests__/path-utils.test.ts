import { describe, expect, it } from "vitest";
import { applyPatches } from "@/shared/llm/apply/apply-patches";
import { walkJsonPath } from "@/shared/llm/apply/path-utils";
import { buildSchemaMap } from "@/shared/types/json-state.schema-map";
import { createInitialVisitJsonState } from "@/shared/types";

describe("walkJsonPath", () => {
  it("résout un path positionnel après auto-vivify apply", () => {
    const state = createInitialVisitJsonState({
      visitId: "11111111-1111-1111-1111-111111111111",
      clientId: "c1",
      title: "VT",
      thermicienId: "22222222-2222-2222-2222-222222222222",
    });
    const out = applyPatches({
      state,
      schemaMap: buildSchemaMap(state),
      patches: [
        {
          path: "heating.installations[0].type_value",
          value: "pompe_a_chaleur_air_eau",
          confidence: "high",
          evidence_refs: [],
        },
      ],
      sourceMessageId: "msg-1",
      sourceExtractionId: "ext-1",
    });

    const target = walkJsonPath(
      out.state as unknown as Record<string, unknown>,
      "heating.installations[0].type_value",
    );

    expect(target.parent).not.toBeNull();
    expect(target.key).toBe("type_value");
    expect((target.parent?.type_value as { value?: unknown }).value).toBe(
      "pompe_a_chaleur_air_eau",
    );
  });
});