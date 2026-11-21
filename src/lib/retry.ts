/** Retry an async operation with exponential backoff for transient failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 600, shouldRetry = isTransient }: { attempts?: number; baseMs?: number; shouldRetry?: (e: unknown) => boolean } = {},
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1 || !shouldRetry(e)) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * 200));
    }
  }
  throw last;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function isTransient(e: unknown): boolean {
  if (e instanceof ApiError) return e.status >= 500 || e.status === 429 || e.status === 0;
  return e instanceof TypeError; // fetch network failure
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  const code = (e as { code?: string }).code;
  if (code === 'permission-denied') return 'You do not have permission to do that.';
  if (code === 'unavailable') return 'You appear to be offline. Changes will sync when you reconnect.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Please allow popups and try again.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (e instanceof TypeError) return 'Network error. Check your connection and try again.';
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong.';
}
