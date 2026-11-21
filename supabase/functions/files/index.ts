/**
 * `files` Edge Function – the ONLY way the browser can touch trip documents.
 *
 *  1. Verifies the caller's Firebase ID token.
 *  2. Checks approved membership in the trip (via Firestore, under the
 *     caller's own security rules).
 *  3. Validates the operation (kind, extension, MIME type, size, path).
 *  4. Enforces uploader/admin permissions for deletes.
 *  5. Returns short-lived signed URLs. The service-role key stays here.
 *
 * Actions (POST JSON):
 *   { action: 'upload',   tripId, kind, fileName, contentType, size }
 *   { action: 'download', tripId, path, fileName?, inline? }
 *   { action: 'delete',   tripId, path }
 *   { action: 'usage',    tripId }   (admin only – storage quota monitoring)
 */
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import { corsHeaders, HttpError, json } from '../_shared/cors.ts';
import { verifyFirebaseToken } from '../_shared/firebaseAuth.ts';
import { decodeFields, getDocAs, requireApprovedMember } from '../_shared/firestore.ts';
import { buildPath, FILE_RULES, type FileKind, isFileKind, parsePath, validateFileMeta } from '../_shared/fileRules.ts';

const BUCKET = 'trip-files';
const DOWNLOAD_TTL_SECONDS = 300; // 5 minutes
const ALLOWED_TRIP = Deno.env.get('TRIP_ID') ?? 'main';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Which Firestore collection/field references each kind of file, and who owns it. */
const REF: Record<FileKind, { collection: string; field: string; owner: string; pendingOnly?: boolean }> = {
  ticket: { collection: 'tickets', field: 'filePath', owner: 'uploadedBy' },
  receipt: { collection: 'expenses', field: 'receiptPath', owner: 'createdBy', pendingOnly: true },
  accommodation: { collection: 'accommodations', field: 'filePath', owner: '__admin_only__' },
  chat: { collection: 'messages', field: 'filePath', owner: 'senderUid' },
};

async function findReferencingDoc(idToken: string, tripId: string, kind: FileKind, path: string) {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const r = REF[kind];
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/trips/${tripId}:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: r.collection }],
          where: { fieldFilter: { field: { fieldPath: r.field }, op: 'EQUAL', value: { stringValue: path } } },
          limit: 1,
        },
      }),
    },
  );
  if (!res.ok) throw new HttpError(502, 'Could not verify file ownership. Try again.');
  const rows = (await res.json()) as { document?: { fields?: Record<string, never> } }[];
  const hit = rows.find((x) => x.document);
  return hit?.document ? decodeFields(hit.document.fields ?? {}) : null;
}

function str(v: unknown, max = 300): string {
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'Invalid request.');
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  try {
    const user = await verifyFirebaseToken(req);
    const body = await req.json().catch(() => {
      throw new HttpError(400, 'Invalid JSON.');
    });
    const tripId = str(body.tripId, 128);
    if (tripId !== ALLOWED_TRIP) throw new HttpError(403, 'Unknown trip.');
    const member = await requireApprovedMember(user.idToken, tripId, user.uid);
    const isAdmin = member.role === 'admin';

    switch (body.action) {
      case 'upload': {
        const kind: unknown = body.kind;
        if (!isFileKind(kind)) throw new HttpError(400, 'Invalid file category.');
        if (FILE_RULES[kind].adminOnly && !isAdmin) throw new HttpError(403, 'Only the trip admin can upload this file.');
        const check = validateFileMeta(kind, str(body.fileName, 200), str(body.contentType, 100), Number(body.size));
        if (!check.ok) throw new HttpError(400, check.error);
        const path = buildPath(tripId, kind, user.uid, crypto.randomUUID(), check.ext);
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data) throw new HttpError(500, 'Could not prepare the upload.');
        return json(req, 200, { path, token: data.token, signedUrl: data.signedUrl, contentType: check.mime });
      }

      case 'download': {
        const path = str(body.path, 400);
        const parsed = parsePath(path);
        if (!parsed || parsed.tripId !== tripId) throw new HttpError(400, 'Invalid file path.');
        const fileName = typeof body.fileName === 'string' ? body.fileName.replace(/[^\w.\- ()]/g, '_').slice(0, 120) : undefined;
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, DOWNLOAD_TTL_SECONDS, body.inline ? undefined : { download: fileName || true });
        if (error || !data) throw new HttpError(404, 'File not found.');
        return json(req, 200, { signedUrl: data.signedUrl, expiresIn: DOWNLOAD_TTL_SECONDS });
      }

      case 'delete': {
        const path = str(body.path, 400);
        const parsed = parsePath(path);
        if (!parsed || parsed.tripId !== tripId) throw new HttpError(400, 'Invalid file path.');

        // Find the record (if any) that still points at this file, using the
        // caller's own token so security rules apply to the lookup.
        const owning = await findReferencingDoc(user.idToken, tripId, parsed.kind, path);
        let allowed = isAdmin;
        if (!allowed && owning) {
          const rule = REF[parsed.kind];
          const d = owning;
          allowed = d[rule.owner] === user.uid && d.locked !== true && (rule.pendingOnly ? d.status === 'pending' : true);
          if (allowed && parsed.kind === 'ticket') {
            const trip = await getDocAs(user.idToken, `trips/${tripId}`);
            if (trip?.ticketsLocked === true) allowed = false;
          }
        } else if (!allowed) {
          // Orphaned upload (cancelled form / replaced file): only its uploader.
          allowed = parsed.ownerUid === user.uid;
        }
        if (!allowed) throw new HttpError(403, 'You can only delete files from records you uploaded.');
        const { error } = await supabase.storage.from(BUCKET).remove([path]);
        if (error) throw new HttpError(500, 'Could not delete the file.');
        return json(req, 200, { ok: true });
      }

      case 'usage': {
        if (!isAdmin) throw new HttpError(403, 'Admin only.');
        let totalBytes = 0;
        let files = 0;
        for (const kind of Object.keys(FILE_RULES)) {
          // list owners, then files per owner (two-level layout)
          const { data: owners } = await supabase.storage.from(BUCKET).list(`trips/${tripId}/${kind}`, { limit: 1000 });
          for (const o of owners ?? []) {
            const { data: items } = await supabase.storage.from(BUCKET).list(`trips/${tripId}/${kind}/${o.name}`, { limit: 1000 });
            for (const it of items ?? []) {
              const size = Number((it.metadata as Record<string, unknown> | null)?.size ?? 0);
              totalBytes += size;
              files += 1;
            }
          }
        }
        return json(req, 200, { totalBytes, files });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.message });
    console.error(e);
    return json(req, 500, { error: 'Unexpected server error.' });
  }
});
