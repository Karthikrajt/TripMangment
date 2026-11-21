/**
 * File validation rules shared by the browser (early feedback) and the
 * Supabase Edge Function (authoritative). Pure TypeScript – no Deno/DOM APIs.
 */
export type FileKind = 'ticket' | 'receipt' | 'accommodation' | 'chat';

const DOCS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as const;
const IMAGES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

export const FILE_RULES: Record<FileKind, { maxBytes: number; types: Record<string, string>; adminOnly: boolean }> = {
  ticket: { maxBytes: 5 * 1024 * 1024, types: DOCS, adminOnly: false },
  receipt: { maxBytes: 5 * 1024 * 1024, types: DOCS, adminOnly: false },
  accommodation: { maxBytes: 5 * 1024 * 1024, types: DOCS, adminOnly: true },
  chat: { maxBytes: 5 * 1024 * 1024, types: { ...DOCS, ...IMAGES }, adminOnly: false },
};

export const FILE_KINDS = Object.keys(FILE_RULES) as FileKind[];

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === 'string' && (FILE_KINDS as string[]).includes(v);
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export type FileCheck = { ok: true; ext: string; mime: string } | { ok: false; error: string };

export function validateFileMeta(kind: FileKind, name: string, mime: string, size: number): FileCheck {
  const rule = FILE_RULES[kind];
  if (!rule) return { ok: false, error: 'Unsupported file category.' };
  const ext = extensionOf(name);
  const expected = rule.types[ext];
  if (!expected) {
    return { ok: false, error: `Allowed file types: ${[...new Set(Object.keys(rule.types))].join(', ').toUpperCase()}.` };
  }
  if ((mime || '').toLowerCase() !== expected) {
    return { ok: false, error: 'File content type does not match its extension.' };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'File is empty.' };
  if (size > rule.maxBytes) return { ok: false, error: `File is too large. Maximum ${Math.round(rule.maxBytes / 1024 / 1024)} MB.` };
  return { ok: true, ext, mime: expected };
}

/** Storage path layout: trips/{tripId}/{kind}/{uploaderUid}/{random}.{ext} */
export function buildPath(tripId: string, kind: FileKind, uid: string, id: string, ext: string): string {
  return `trips/${tripId}/${kind}/${uid}/${id}.${ext}`;
}

export interface ParsedPath {
  tripId: string;
  kind: FileKind;
  ownerUid: string;
  file: string;
}

const SAFE = /^[A-Za-z0-9_-]{1,128}$/;

export function parsePath(path: string): ParsedPath | null {
  if (typeof path !== 'string' || path.length > 400 || path.includes('..')) return null;
  const parts = path.split('/');
  if (parts.length !== 5 || parts[0] !== 'trips') return null;
  const [, tripId, kind, ownerUid, file] = parts;
  if (!SAFE.test(tripId) || !isFileKind(kind) || !SAFE.test(ownerUid)) return null;
  if (!/^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{2,5}$/.test(file)) return null;
  return { tripId, kind, ownerUid, file };
}
