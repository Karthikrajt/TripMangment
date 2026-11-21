import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { HttpError } from './cors.ts';

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export interface FirebaseUser {
  uid: string;
  email: string;
  idToken: string;
}

/** Verify a Firebase ID token server-side (signature, issuer, audience, expiry). */
export async function verifyFirebaseToken(req: Request): Promise<FirebaseUser> {
  if (!PROJECT_ID) throw new HttpError(500, 'Server is not configured (FIREBASE_PROJECT_ID).');
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) throw new HttpError(401, 'Missing bearer token.');
  try {
    const { payload } = await jwtVerify(m[1], JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ['RS256'],
    });
    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    if (!uid || uid.length > 128) throw new Error('bad sub');
    if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 60_000) throw new Error('auth_time in future');
    return { uid, email: String(payload.email ?? ''), idToken: m[1] };
  } catch {
    throw new HttpError(401, 'Invalid or expired sign-in. Please sign in again.');
  }
}
