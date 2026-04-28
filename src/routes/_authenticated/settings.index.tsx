import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /settings → /settings/ai (Section 2 livrée par défaut).
 */
export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/ai" });
  },
});
