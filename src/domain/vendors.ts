import type { Vendor, VendorCategory, VendorStatus } from './types';
import { isHttpUrl, isMapsUrl, isPhone } from './validation';

export const CATEGORY_LABELS: Record<VendorCategory, string> = {
  hotel: 'Hotel',
  resort: 'Resort',
  homestay: 'Homestay',
  travel_agent: 'Travel agent',
  bus: 'Bus operator',
  taxi: 'Taxi / cab',
  restaurant: 'Restaurant / caterer',
  activity: 'Activity / guide',
  other: 'Other',
};

export const STATUS_LABELS: Record<VendorStatus, string> = {
  shortlisted: 'Shortlisted',
  enquired: 'Enquired',
  quoted: 'Quote received',
  booked: 'Booked',
  rejected: 'Not chosen',
};

/** Order used for sorting: what still needs action first, rejected last. */
const STATUS_ORDER: Record<VendorStatus, number> = { booked: 0, quoted: 1, enquired: 2, shortlisted: 3, rejected: 4 };

export const STAY_CATEGORIES: VendorCategory[] = ['hotel', 'resort', 'homestay'];

/**
 * Digits for a wa.me / tel link. Indian 10-digit mobiles get the 91 country
 * code; numbers already with a country code are kept. Returns '' if unusable.
 */
export function whatsappNumber(phone: string): string {
  let d = (phone ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = '91' + d.slice(1);
  else if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d;
  d = d.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : '';
}

export function whatsappLink(phone: string): string {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}` : '';
}

export type VendorInput = Omit<Vendor, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>;

export function validateVendor(v: VendorInput): Partial<Record<keyof VendorInput, string>> {
  const e: Partial<Record<keyof VendorInput, string>> = {};
  if (!v.name.trim()) e.name = 'Name is required.';
  if (v.phone && !isPhone(v.phone)) e.phone = 'Invalid phone number.';
  if (v.altPhone && !isPhone(v.altPhone)) e.altPhone = 'Invalid phone number.';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Invalid email address.';
  if (v.website && !isHttpUrl(v.website.trim())) e.website = 'Paste a full link starting with https://';
  if (v.mapsUrl && !isMapsUrl(v.mapsUrl.trim())) e.mapsUrl = 'Paste a Google Maps link.';
  if (!Number.isSafeInteger(v.quotePaise) || v.quotePaise < 0) e.quotePaise = 'Enter a valid amount.';
  if (!Number.isInteger(v.rating) || v.rating < 0 || v.rating > 5) e.rating = 'Rating must be 0–5.';
  return e;
}

export interface VendorFilter {
  q: string;
  category: '' | VendorCategory;
  status: '' | VendorStatus;
}

export function filterVendors(list: Vendor[], f: VendorFilter): Vendor[] {
  const needle = f.q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  return list
    .filter((v) => (!f.category || v.category === f.category) && (!f.status || v.status === f.status))
    .filter((v) => {
      if (!needle) return true;
      const hay = [v.name, v.contactPerson, v.location, v.email, v.notes, v.quoteNote, CATEGORY_LABELS[v.category]].join(' ').toLowerCase();
      if (hay.includes(needle)) return true;
      return digits.length >= 4 && [v.phone, v.altPhone].some((p) => p.replace(/\D/g, '').includes(digits));
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
}

export function countByStatus(list: Vendor[]): Record<VendorStatus, number> {
  const out = { shortlisted: 0, enquired: 0, quoted: 0, booked: 0, rejected: 0 } as Record<VendorStatus, number>;
  for (const v of list) out[v.status] += 1;
  return out;
}
