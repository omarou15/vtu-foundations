import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * État d'authentification global (Zustand, pas de Context).
 *
 * Règles critiques (cf. KNOWLEDGE §2 + bonnes pratiques Supabase) :
 * - `onAuthStateChange` est branché AVANT `getSession()` pour éviter
 *   la race où un événement (TOKEN_REFRESHED, SIGNED_IN via magic
 *   link) arrive entre les deux et serait perdu.
 * - On ne fait JAMAIS d'appels async (fetch profil, etc.) dans le
 *   callback `onAuthStateChange` de manière bloquante : on stocke
 *   d'abord, on enrichit après via un `setTimeout(..., 0)` si besoin.
 * - Le store est initialisé une seule fois côté client
 *   (`initAuth()`), idempotent.
 */

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** Idempotent — peut être appelée plusieurs fois sans effet de bord. */
  init: () => () => void;
  signInWithMagicLink: (
    email: string,
    redirectTo?: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

let initialized = false;
let onSessionExpired: (() => void) | null = null;

/** Permet à l'app (root layout) d'enregistrer un handler global pour
 * afficher un toast non-bloquant quand la session expire. */
export function setOnSessionExpired(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  session: null,
  user: null,

  init: () => {
    if (initialized || typeof window === "undefined") {
      return () => {};
    }
    initialized = true;

    // 1. Listener AVANT getSession (sinon race possible).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const previous = get().session;

      set({
        session,
        user: session?.user ?? null,
        status: session ? "authenticated" : "unauthenticated",
      });

      // Toast non-bloquant si on perd la session pendant l'usage
      // (ex: refresh token expiré, révocation côté serveur).
      if (event === "SIGNED_OUT" && previous && onSessionExpired) {
        onSessionExpired();
      }
    });

    // 2. Lecture initiale (le listener gère la suite).
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Si le listener a déjà posté un état authenticated entre-temps,
      // on ne régresse pas vers unauthenticated par erreur.
      if (get().status === "loading") {
        set({
          session,
          user: session?.user ?? null,
          status: session ? "authenticated" : "unauthenticated",
        });
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      initialized = false;
    };
  },

  signInWithMagicLink: async (email, redirectTo) => {
    const emailRedirectTo = `${window.location.origin}/auth/callback${
      redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""
    }`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        // shouldCreateUser true : magic link agit aussi comme signup.
        shouldCreateUser: true,
      },
    });

    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // Le listener met le store à jour automatiquement.
  },
}));
