/** Small, dependency-free validators used by forms and services. */
export type Errors<T> = Partial<Record<keyof T | '_form', string>>;

export const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
export const isClockTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isIndianPhone = (v: string) => /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/.test(v.trim());
export const isPhone = (v: string) => /^\+?[\d\s()-]{6,20}$/.test(v.trim());
export const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};
/** Only allow Google Maps links so we never render arbitrary third-party URLs as "navigate". */
export const isMapsUrl = (v: string) => {
  if (!isHttpUrl(v)) return false;
  const host = new URL(v).hostname;
  return /(^|\.)google\.[a-z.]+$/.test(host) || host === 'maps.app.goo.gl' || host === 'goo.gl';
};
export const trimmed = (v: string | undefined | null, max = 500) => (v ?? '').trim().slice(0, max);

export function required(v: string, label: string): string | undefined {
  return v.trim() ? undefined : `${label} is required.`;
}

export function hasErrors<T>(e: Errors<T>): boolean {
  return Object.values(e).some(Boolean);
}
