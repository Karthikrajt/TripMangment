/**
 * Google service-account OAuth for FCM HTTP v1 + Firestore (token lookup).
 * The service account JSON is stored ONLY as the Supabase secret
 * FCM_SERVICE_ACCOUNT. If it is absent, push delivery is simply skipped –
 * in-app notifications remain the source of truth.
 */
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cached: { token: string; exp: number } | null = null;

export function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  // Plain JSON, or base64-encoded JSON (what the deploy workflow stores).
  for (const text of [raw, () => atob(raw.trim())]) {
    try {
      const sa = JSON.parse(typeof text === 'string' ? text : text()) as ServiceAccount;
      if (sa?.client_email && sa?.private_key) return sa;
    } catch {
      /* try the next format */
    }
  }
  return null;
}

export async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error('google oauth failed');
  const body = await res.json();
  cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return cached.token;
}
