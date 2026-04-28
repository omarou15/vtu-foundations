/**
 * Skeleton générique affiché en fallback pendant qu'un chunk se recharge
 * (après un échec d'import dynamique automatiquement retenté).
 */
export function RouteSkeleton({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-32 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>

      <span className="sr-only">{label ?? "Chargement en cours…"}</span>
    </div>
  );
}
