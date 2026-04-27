/**
 * Hook : appelle l'Edge Function `vtu-monitoring` (admin only).
 *
 * Refresh automatique toutes les 30s. Ne déclenche aucun appel tant que
 * l'utilisateur n'est pas admin (gate côté caller).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AlertLevel = "warning" | "critical";
export type Status = "ok" | "warning" | "critical";

export interface Alert {
  level: AlertLevel;
  category: "llm" | "sync" | "usage" | "infra";
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface MonitoringSnapshot {
  ok: boolean;
  generated_at: string;
  window_hours: number;
  global_status: Status;
  global_alerts: Alert[];
  llm: {
    total_calls: number;
    by_status: Record<string, number>;
    by_mode: Record<string, number>;
    by_error_code: Record<string, number>;
    latency_ms: { p50: number; p95: number; p99: number; max: number } | null;
    total_input_tokens: number;
    total_output_tokens: number;
    estimated_cost_usd: number;
    error_rate_pct: number;
    status: Status;
    alerts: Alert[];
  };
  sync_proxy: {
    visits_created: number;
    messages_inserted: number;
    attachments_inserted: number;
    json_state_versions: number;
    oldest_pending_message_age_minutes: number | null;
    status: Status;
    alerts: Alert[];
  };
  usage: {
    unique_active_users: number;
    visits_total: number;
    messages_user: number;
    messages_assistant: number;
    messages_actions_card: number;
    attachments_count: number;
    attachments_pdf: number;
    attachments_photo: number;
    patches_proposed: number;
    patches_validated: number;
    patches_rejected: number;
    ai_adoption_pct: number;
  };
  infra: {
    tables: Array<{ name: string; row_count: number; last_write: string | null }>;
    buckets: string[];
  };
  events: Array<{
    ts: string;
    level: "info" | "warning" | "error";
    source: "llm" | "sync" | "usage" | "infra";
    message: string;
    meta?: Record<string, unknown>;
  }>;
}

export function useMonitoring(opts: {
  enabled: boolean;
  hours: number;
}): {
  data: MonitoringSnapshot | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: ["monitoring", opts.hours],
    enabled: opts.enabled,
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<MonitoringSnapshot>(
        "vtu-monitoring",
        {
          method: "GET",
          // @ts-expect-error supabase-js types n'incluent pas query mais le runtime le supporte
          query: { hours: String(opts.hours) },
        },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error("monitoring snapshot invalid");
      return data;
    },
  });

  return {
    data: q.data,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: (q.error as Error | null) ?? null,
    refetch: () => void q.refetch(),
  };
}
