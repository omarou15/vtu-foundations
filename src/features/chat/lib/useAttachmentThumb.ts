/**
 * VTU — PR2 : résolution d'une thumbnail d'attachment, observable.
 *
 * Stratégie inchangée :
 *  1. Blob local Dexie (`compressed` puis `thumbnail`) si dispo.
 *  2. Sinon, si `synced`, signed URL Supabase Storage (TTL 1h).
 *  3. Back-fill du blob local en arrière-plan.
 *
 * Nouveautés PR2 :
 *  - Statut détaillé exposé (`status`) au lieu d'un simple `failed: boolean`.
 *  - `errorCode` / `errorMessage` capturés (HTTP status, supabase error,
 *    "no_path", "decode_failed" via `markDecodeError()`) pour permettre à
 *    l'UI d'afficher quelque chose de concret au lieu d'un pulse infini.
 *  - `markDecodeError()` exposé pour brancher `<img onError>` côté UI :
 *    une URL signée qui retourne 200 mais ne décode pas est désormais
 *    surfacée comme une erreur visible.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
const inFlight = new Map<string, Promise<SignResult>>();

interface SignResult {
  url: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type ThumbStatus =
  | "pdf"
  | "local_blob_available"
  | "remote_signing"
  | "remote_signed"
  | "remote_fetching"
  | "backfilled"
  | "no_path"
  | "failed";

export interface UseAttachmentThumbResult {
  /** Local Blob (préféré). Null si pas encore disponible. */
  localUrl: string | null;
  /** URL signée distante (fallback). Null tant qu'on n'a rien tenté. */
  remoteUrl: string | null;
  /** True quand l'attachment est synced mais qu'on n'a ni blob local ni URL. */
  isLoading: boolean;
  /** True si Storage a renvoyé 404 / erreur définitive. */
  failed: boolean;
  /** Statut détaillé pour debug / UI riche. */
  status: ThumbStatus;
  /** Code d'erreur normalisé ("404", "no_path", "decode_failed", ...). */
  errorCode: string | null;
  /** Message human-readable (dev/diagnostic). */
  errorMessage: string | null;
  /** À brancher sur `<img onError>` : marque l'image comme indécodable. */
  markDecodeError: () => void;
}

/**
 * Hook réactif : retourne une URL prête à passer dans `<img src>`.
 * Préfère localUrl si dispo, sinon remoteUrl, sinon null.
 */
export function useAttachmentThumb(
  attachment: LocalAttachment,
): UseAttachmentThumbResult {
  const isPdf = attachment.media_profile === "pdf";

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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [backfilled, setBackfilled] = useState(false);
  const lastDecodeErrorUrlRef = useRef<string | null>(null);

  // ObjectURL pour le blob local
  useEffect(() => {
    if (!blob) {
      setLocalUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setLocalUrl(u);
    setErrorCode(null);
    setErrorMessage(null);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Fallback distant
  useEffect(() => {
    if (isPdf) return;
    if (blob) return;
    if (attachment.sync_status !== "synced") return;
    if (!attachment.thumbnail_path && !attachment.compressed_path) {
      setErrorCode("no_path");
      setErrorMessage("Aucun chemin Storage pour cet attachment.");
      return;
    }

    let cancelled = false;
    setIsSigning(true);
    void (async () => {
      const result = await resolveSignedUrl(attachment);
      if (cancelled) return;
      setIsSigning(false);
      if (result.url) {
        setRemoteUrl(result.url);
        setErrorCode(null);
        setErrorMessage(null);
        // Back-fill local en arrière-plan
        void backfillBlob(attachment, result.url).then((ok) => {
          if (!cancelled && ok) setBackfilled(true);
        });
      } else {
        setRemoteUrl(null);
        setErrorCode(result.errorCode);
        setErrorMessage(result.errorMessage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attachment.id,
    attachment.bucket,
    attachment.sync_status,
    attachment.thumbnail_path,
    attachment.compressed_path,
    blob,
    isPdf,
  ]);

  const markDecodeError = useCallback(() => {
    const target = localUrl ?? remoteUrl;
    if (!target) return;
    if (lastDecodeErrorUrlRef.current === target) return;
    lastDecodeErrorUrlRef.current = target;
    setErrorCode("decode_failed");
    setErrorMessage("L'image n'a pas pu être décodée.");
    // On ne purge pas l'URL : l'UI décide de basculer sur "indispo".
    setRemoteUrl(null);
    setLocalUrl(null);
  }, [localUrl, remoteUrl]);

  const failed = errorCode !== null && errorCode !== "no_path"
    ? true
    : errorCode === "no_path";

  const status: ThumbStatus = isPdf
    ? "pdf"
    : localUrl
      ? backfilled
        ? "backfilled"
        : "local_blob_available"
      : remoteUrl
        ? "remote_signed"
        : isSigning
          ? "remote_signing"
          : errorCode === "no_path"
            ? "no_path"
            : errorCode
              ? "failed"
              : "remote_fetching";

  const isLoading =
    !isPdf &&
    !localUrl &&
    !remoteUrl &&
    !errorCode &&
    attachment.sync_status !== "failed";

  return {
    localUrl,
    remoteUrl,
    isLoading,
    failed,
    status,
    errorCode,
    errorMessage,
    markDecodeError,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveSignedUrl(
  attachment: LocalAttachment,
): Promise<SignResult> {
  const path = attachment.compressed_path ?? attachment.thumbnail_path;
  if (!path) {
    return { url: null, errorCode: "no_path", errorMessage: "no compressed_path / thumbnail_path" };
  }

  const cacheKey = `${attachment.bucket}::${path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { url: cached.url, errorCode: null, errorMessage: null };
  }

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const p: Promise<SignResult> = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(attachment.bucket)
        .createSignedUrl(path, SIGNED_TTL_S);
      if (error || !data?.signedUrl) {
        const code = inferStorageErrorCode(error);
        return {
          url: null,
          errorCode: code,
          errorMessage: error?.message ?? "createSignedUrl returned no url",
        };
      }
      const signedUrl = normalizeSignedUrl(data.signedUrl);
      signedUrlCache.set(cacheKey, {
        url: signedUrl,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { url: signedUrl, errorCode: null, errorMessage: null };
    } catch (err) {
      return {
        url: null,
        errorCode: "network_error",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, p);
  return p;
}

function inferStorageErrorCode(err: { message?: string } | null | undefined): string {
  const msg = (err?.message ?? "").toLowerCase();
  if (msg.includes("not found") || msg.includes("404")) return "404";
  if (msg.includes("forbidden") || msg.includes("403") || msg.includes("unauthorized")) return "403";
  if (msg.includes("network")) return "network_error";
  return "storage_error";
}

const backfillInFlight = new Set<string>();

async function backfillBlob(
  attachment: LocalAttachment,
  signedUrl: string,
): Promise<boolean> {
  if (backfillInFlight.has(attachment.id)) return false;
  backfillInFlight.add(attachment.id);
  try {
    const db = getDb();
    const existing = await db.attachment_blobs.get(attachment.id);
    if (existing?.thumbnail || existing?.compressed) return false;

    const resp = await fetch(signedUrl);
    if (!resp.ok) return false;
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
    return true;
  } catch {
    return false;
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
