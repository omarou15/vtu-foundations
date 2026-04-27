/**
 * VTU — It. 14 : résolution d'une thumbnail d'attachment.
 *
 * Stratégie :
 *  1. Si un blob local existe (`compressed` puis `thumbnail`), on l'utilise
 *     → instantané, offline-friendly. Le full compressed est préféré car les
 *     miniatures historiques peuvent être absentes ou invalides.
 *  2. Sinon, si l'attachment est `synced` côté serveur, on demande une URL
 *     signée à Supabase Storage (TTL 1h) et on l'affiche.
 *  3. En arrière-plan, on fetch le blob distant et on le ré-écrit dans
 *     Dexie pour les ouvertures suivantes (back-fill).
 *
 * Le blob est lu en `useLiveQuery` → si le back-fill réussit, le composant
 * bascule automatiquement sur le blob local sans rerender forcé.
 *
 * Cache d'URLs signées en mémoire (per-tab) pour éviter de re-signer à
 * chaque rerender. TTL 55min (signed url = 60min côté Supabase).
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type LocalAttachment } from "@/shared/db";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_TTL_S = 60 * 60; // 1h
const CACHE_TTL_MS = 55 * 60 * 1000; // 55min — refresh avant expiration

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

export interface UseAttachmentThumbResult {
  /** Local Blob (préféré). Null si pas encore disponible. */
  localUrl: string | null;
  /** URL signée distante (fallback). Null tant qu'on n'a rien tenté. */
  remoteUrl: string | null;
  /** True quand l'attachment est synced mais qu'on n'a ni blob local ni URL. */
  isLoading: boolean;
  /** True si Storage a renvoyé 404 / erreur définitive. */
  failed: boolean;
}

/**
 * Hook réactif : retourne une URL prête à passer dans `<img src>`.
 * Préfère localUrl si dispo, sinon remoteUrl, sinon null.
 */
export function useAttachmentThumb(
  attachment: LocalAttachment,
): UseAttachmentThumbResult {
  const isPdf = attachment.media_profile === "pdf";

  // Réactif : se réveille si le blob arrive après le mount (rafale → upload
  // en cours) OU si le back-fill réécrit le blob.
  const blob = useLiveQuery(
    async () => {
      if (isPdf) return null;
      const row = await getDb().attachment_blobs.get(attachment.id);
      return row?.compressed ?? row?.thumbnail ?? null;
    },
    [attachment.id, isPdf],
    null as Blob | null,
  );

  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // ObjectURL pour le blob local
  useEffect(() => {
    if (!blob) {
      setLocalUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setLocalUrl(u);
    setFailed(false);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Fallback distant : seulement si pas de blob local + attachment synced
  useEffect(() => {
    if (isPdf) return;
    if (blob) return; // local OK → pas besoin
    if (attachment.sync_status !== "synced") return;
    if (!attachment.thumbnail_path && !attachment.compressed_path) return;

    let cancelled = false;
    void (async () => {
      const url = await resolveSignedUrl(attachment);
      if (cancelled) return;
      if (url) {
        setRemoteUrl(url);
        setFailed(false);
        // Back-fill local en arrière-plan (best-effort, no await)
        void backfillBlob(attachment, url);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attachment.id,
    attachment.sync_status,
    attachment.thumbnail_path,
    attachment.compressed_path,
    blob,
    isPdf,
  ]);

  const isLoading =
    !isPdf &&
    !localUrl &&
    !remoteUrl &&
    !failed &&
    attachment.sync_status !== "failed";

  return { localUrl, remoteUrl, isLoading, failed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveSignedUrl(
  attachment: LocalAttachment,
): Promise<string | null> {
  const path = attachment.compressed_path ?? attachment.thumbnail_path;
  if (!path) return null;

  const cacheKey = `${attachment.bucket}::${path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;

  // Dédup les requêtes parallèles pour le même path
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const p = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(attachment.bucket)
        .createSignedUrl(path, SIGNED_TTL_S);
      if (error || !data?.signedUrl) {
        return null;
      }
      const signedUrl = normalizeSignedUrl(data.signedUrl);
      signedUrlCache.set(cacheKey, {
        url: signedUrl,
        expiresAt: now + CACHE_TTL_MS,
      });
      return signedUrl;
    } catch {
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, p);
  return p;
}

const backfillInFlight = new Set<string>();

async function backfillBlob(
  attachment: LocalAttachment,
  signedUrl: string,
): Promise<void> {
  if (backfillInFlight.has(attachment.id)) return;
  backfillInFlight.add(attachment.id);
  try {
    // Vérifie qu'on n'a pas déjà été back-fillé par une autre instance
    const db = getDb();
    const existing = await db.attachment_blobs.get(attachment.id);
    if (existing?.thumbnail || existing?.compressed) return;

    const resp = await fetch(signedUrl);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const isThumbnail = signedUrl.includes(
      attachment.thumbnail_path ?? "__no_thumb__",
    );
    await db.attachment_blobs.put({
      attachment_id: attachment.id,
      compressed: isThumbnail ? (existing?.compressed ?? blob) : blob,
      thumbnail: isThumbnail ? blob : (existing?.thumbnail ?? null),
      created_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  } finally {
    backfillInFlight.delete(attachment.id);
  }
}

/** Pour les tests : reset les caches. */
export function __resetThumbCaches(): void {
  signedUrlCache.clear();
  inFlight.clear();
  backfillInFlight.clear();
}

function normalizeSignedUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${url}`;
}
