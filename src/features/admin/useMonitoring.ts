/**
 * Hook : appelle l'Edge Function `vtu-monitoring` (admin only).
 *
 * Refresh automatique toutes les 30s. Ne déclenche aucun appel tant que
 * l'utilisateur n'est pas admin (gate côté caller).
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

async function fetchMonitoring(hours: number): Promise<MonitoringSnapshot> {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const baseUrl = env?.VITE_SUPABASE_URL;
  const anon = env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl) throw new Error("VITE_SUPABASE_URL manquant");

  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw new Error(sessErr.message);
  const jwt = sess?.session?.access_token;
  if (!jwt) throw new Error("Session manquante (reconnecte-toi)");

  const url = `${baseUrl}/functions/v1/vtu-monitoring?hours=${hours}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(anon ? { apikey: anon } : {}),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = (await res.json()) as MonitoringSnapshot;
  if (!data?.ok) throw new Error("monitoring snapshot invalid");
  return data;
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
  const { enabled, hours } = opts;
  const [data, setData] = useState<MonitoringSnapshot | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(
    async (initial: boolean) => {
      if (initial) setIsLoading(true);
      setIsFetching(true);
      setError(null);
      try {
        const snap = await fetchMonitoring(hours);
        if (cancelledRef.current) return;
        setData(snap);
      } catch (e) {
        if (cancelledRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelledRef.current) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    },
    [hours],
  );

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) {
      setIsLoading(false);
      setIsFetching(false);
      return;
    }
    void load(true);
    const id = window.setInterval(() => {
      void load(false);
    }, 30_000);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [enabled, load]);

  const refetch = useCallback(() => {
    void load(false);
  }, [load]);

  return { data, isLoading, isFetching, error, refetch };
}
