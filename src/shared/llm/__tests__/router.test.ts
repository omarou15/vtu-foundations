/**
 * It. 10 — Tests router déterministe.
 *
 * Couvre les arbitrages docs (KNOWLEDGE §15) :
 *  - médias → extract.
 *  - hint conversational PRIME sur terrain_pattern.
 *  - terrain_pattern (m², R+n, VMC, …) → extract.
 *  - short_capture (≤4 mots) → extract.
 *  - bruit ("ok") → ignore.
 */

import { describe, expect, it } from "vitest";
import { routeMessage } from "@/shared/llm/router";

function user(content: string | null) {
  return { role: "user" as const, kind: "text" as const, content };
}

describe("router déterministe", () => {
  it("photo → extract via media_photo", () => {
    const out = routeMessage({
      role: "user",
      kind: "photo",
      content: null,
    });
    expect(out.needsLlm).toBe(false);
    expect(out.decision?.route).toBe("extract");
    expect(out.decision && "reason" in out.decision && out.decision.reason).toBe(
      "media_photo",
    );
  });

  it("audio → extract via media_audio", () => {
    const out = routeMessage({
      role: "user",
      kind: "audio",
      content: null,
    });
    expect(out.decision?.route).toBe("extract");
  });

  it("role assistant → ignore non_user_role", () => {
    const out = routeMessage({
      role: "assistant",
      kind: "text",
      content: "blah",
    });
    expect(out.decision?.route).toBe("ignore");
  });

  it("texte vide → ignore empty", () => {
    expect(routeMessage(user("")).decision?.route).toBe("ignore");
    expect(routeMessage(user("   ")).decision?.route).toBe("ignore");
  });

  it("'ok' / '👍' → ignore noise", () => {
    expect(routeMessage(user("ok")).decision?.route).toBe("ignore");
    expect(routeMessage(user("merci")).decision?.route).toBe("ignore");
    expect(routeMessage(user("👍")).decision?.route).toBe("ignore");
  });

  it("'?' final → conversational", () => {
    const out = routeMessage(user("Quelle surface au RDC ?"));
    expect(out.decision?.route).toBe("conversational");
  });

  it("'résume cette VT, surface 145 m²' → conversational (hint PRIME terrain)", () => {
    const out = routeMessage(user("résume cette VT, surface 145 m²"));
    expect(out.decision?.route).toBe("conversational");
    expect(
      out.decision && "reason" in out.decision && out.decision.reason,
    ).toBe("conversational_hint");
  });

  it("'explique-moi la VMC' → conversational", () => {
    expect(routeMessage(user("explique-moi la VMC")).decision?.route).toBe(
      "conversational",
    );
  });

  it("'R+2 HSP 2.7' → extract via terrain_pattern", () => {
    const out = routeMessage(user("R+2 HSP 2.7"));
    expect(out.decision?.route).toBe("extract");
    expect(
      out.decision && "reason" in out.decision && out.decision.reason,
    ).toBe("terrain_pattern");
  });

  it("'VMC simple flux' → extract via terrain_pattern", () => {
    const out = routeMessage(user("VMC simple flux"));
    expect(out.decision?.route).toBe("extract");
    expect(
      out.decision && "reason" in out.decision && out.decision.reason,
    ).toBe("terrain_pattern");
  });

  it("'PAC air/eau' → extract via terrain_pattern", () => {
    const out = routeMessage(user("PAC air eau"));
    expect(out.decision?.route).toBe("extract");
  });

  it("'salon' (1 mot) → extract via short_capture", () => {
    const out = routeMessage(user("salon"));
    expect(out.decision?.route).toBe("extract");
    expect(
      out.decision && "reason" in out.decision && out.decision.reason,
    ).toBe("short_capture");
  });

  it("phrase longue sans pattern → extract via default_extract", () => {
    const out = routeMessage(
      user(
        "Le client souhaite isoler la toiture par sarking et doublage murs intérieurs",
      ),
    );
    expect(out.decision?.route).toBe("extract");
    expect(
      out.decision && "reason" in out.decision && out.decision.reason,
    ).toBe("default_extract");
  });
});
