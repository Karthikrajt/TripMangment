/**
 * Browser client for the `files` Edge Function. The browser never holds the
 * Supabase service-role key; it only receives short-lived signed URLs.
 */
import { auth, tripId } from './firebase';
import { env } from '../config/env';
import { ApiError, withRetry } from './retry';
import { compressImageIfLarge } from './image';
import { validateFileMeta, type FileKind } from '../../supabase/functions/_shared/fileRules';

export type { FileKind };
const BUCKET = 'trip-files';

export const filesConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

// supabase-js is only needed for uploads – load it on demand to keep the app shell small.
let client: Promise<import('@supabase/supabase-js').SupabaseClient> | null = null;
function storageClient() {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return client;
}

async function callFiles<T>(payload: Record<string, unknown>): Promise<T> {
  if (!env.supabaseUrl) throw new ApiError(500, 'File storage is not configured.');
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Please sign in again.');
  return withRetry(async () => {
    const token = await user.getIdToken();
    const res = await fetch(`${env.supabaseUrl}/functions/v1/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env.supabaseAnonKey },
      body: JSON.stringify({ tripId, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, body.error ?? 'File service error.');
    return body as T;
  });
}

export interface UploadedFile {
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Validate → (compress) → get signed upload URL → upload. */
export async function uploadFile(kind: FileKind, original: File, onProgress?: (stage: string) => void): Promise<UploadedFile> {
  if (!filesConfigured) throw new ApiError(500, 'File storage is not configured.');
  const supabase = await storageClient();
  const pre = validateFileMeta(kind, original.name, original.type, original.size);
  // Allow large images through pre-check: they may compress below the limit.
  if (!pre.ok && !(original.type.startsWith('image/') && /too large/.test(pre.error))) throw new ApiError(400, pre.error);
  onProgress?.('Preparing…');
  const file = await compressImageIfLarge(original);
  const check = validateFileMeta(kind, file.name, file.type, file.size);
  if (!check.ok) throw new ApiError(400, check.error);

  const signed = await callFiles<{ path: string; token: string; contentType: string }>({
    action: 'upload',
    kind,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  onProgress?.('Uploading…');
  await withRetry(async () => {
    const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: signed.contentType,
      upsert: false,
    });
    if (error) throw new ApiError(0, error.message || 'Upload failed.');
  });
  return { path: signed.path, fileName: original.name.slice(0, 200), fileType: signed.contentType, fileSize: file.size };
}

export async function getDownloadUrl(path: string, opts: { fileName?: string; inline?: boolean } = {}): Promise<string> {
  const r = await callFiles<{ signedUrl: string }>({ action: 'download', path, fileName: opts.fileName, inline: opts.inline });
  return r.signedUrl;
}

/** Best effort: failures leave an orphan that the admin can clean up later. */
export async function deleteFile(path: string): Promise<void> {
  if (!path) return;
  await callFiles({ action: 'delete', path });
}

export async function getStorageUsage(): Promise<{ totalBytes: number; files: number }> {
  return callFiles({ action: 'usage' });
}

export async function fetchFileBlob(path: string): Promise<Blob> {
  const url = await getDownloadUrl(path, { inline: true });
  const res = await withRetry(() => fetch(url).then((r) => {
    if (!r.ok) throw new ApiError(r.status, 'Download failed.');
    return r;
  }));
  return res.blob();
}
