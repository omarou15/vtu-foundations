import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Supabase client AVANT d'importer le store.
const onAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const getSession = vi.fn(() =>
  Promise.resolve({ data: { session: null } }),
);
const signInWithOtp = vi.fn(() => Promise.resolve({ error: null }));
const signOut = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { onAuthStateChange, getSession, signInWithOtp, signOut },
  },
}));

describe("auth store", () => {
  beforeEach(() => {
    vi.resetModules();
    onAuthStateChange.mockClear();
    getSession.mockClear();
    signInWithOtp.mockClear();
    signOut.mockClear();
  });

  it("init() registers onAuthStateChange BEFORE getSession", async () => {
    const { useAuth } = await import("../store");
    const callOrder: string[] = [];
    onAuthStateChange.mockImplementationOnce(() => {
      callOrder.push("listener");
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    getSession.mockImplementationOnce(() => {
      callOrder.push("getSession");
      return Promise.resolve({ data: { session: null } });
    });

    useAuth.getState().init();
    expect(callOrder[0]).toBe("listener");
    expect(callOrder[1]).toBe("getSession");
  });

  it("starts in loading status and resolves to unauthenticated when no session", async () => {
    const { useAuth } = await import("../store");
    expect(useAuth.getState().status).toBe("loading");
    useAuth.getState().init();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAuth.getState().status).toBe("unauthenticated");
  });

  it("signInWithMagicLink calls supabase signInWithOtp with emailRedirectTo", async () => {
    const { useAuth } = await import("../store");
    // jsdom fournit window.location.origin
    await useAuth
      .getState()
      .signInWithMagicLink("test@example.com", "/visits");
    expect(signInWithOtp).toHaveBeenCalledOnce();
    const arg = signInWithOtp.mock.calls[0][0] as {
      email: string;
      options: { emailRedirectTo: string };
    };
    expect(arg.email).toBe("test@example.com");
    expect(arg.options.emailRedirectTo).toContain("/auth/callback");
    expect(arg.options.emailRedirectTo).toContain(
      encodeURIComponent("/visits"),
    );
  });
});
