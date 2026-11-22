import { describe, expect, it } from 'vitest';
import { countByStatus, filterVendors, validateVendor, whatsappLink, whatsappNumber, type VendorInput } from './vendors';
import type { Vendor } from './types';

// Made-up data only.
const base: VendorInput = {
  name: 'Sample Resort', category: 'resort', status: 'enquired', contactPerson: '', phone: '', altPhone: '', email: '', website: '',
  location: '', mapsUrl: '', quotePaise: 0, quoteNote: '', rating: 0, notes: '',
};
const v = (p: Partial<Vendor>): Vendor => ({ ...base, id: Math.random().toString(36), createdBy: 'u', createdByName: 'T', createdAt: null, updatedAt: null, ...p }) as Vendor;

describe('whatsappNumber', () => {
  it('adds 91 to Indian 10-digit mobiles', () => {
    expect(whatsappNumber('98765 43210')).toBe('919876543210');
    expect(whatsappNumber('098765-43210')).toBe('919876543210');
  });
  it('keeps numbers that already have a country code', () => {
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210');
    expect(whatsappNumber('+44 20 7946 0958')).toBe('442079460958');
    expect(whatsappNumber('0044 20 7946 0958')).toBe('442079460958');
  });
  it('rejects unusable numbers', () => {
    expect(whatsappNumber('12345')).toBe('');
    expect(whatsappNumber('')).toBe('');
    expect(whatsappLink('abc')).toBe('');
  });
  it('builds a wa.me link', () => expect(whatsappLink('9876543210')).toBe('https://wa.me/919876543210'));
});

describe('validateVendor', () => {
  it('requires a name and checks formats', () => {
    expect(validateVendor({ ...base, name: ' ' }).name).toBeTruthy();
    expect(validateVendor({ ...base, phone: 'abc' }).phone).toBeTruthy();
    expect(validateVendor({ ...base, email: 'x@' }).email).toBeTruthy();
    expect(validateVendor({ ...base, website: 'example.com' }).website).toBeTruthy();
    expect(validateVendor({ ...base, mapsUrl: 'https://evil.example/x' }).mapsUrl).toBeTruthy();
    expect(validateVendor({ ...base, rating: 6 }).rating).toBeTruthy();
    expect(validateVendor({ ...base, quotePaise: 12.5 }).quotePaise).toBeTruthy();
    expect(validateVendor({ ...base, phone: '98765 43210', email: 'a@b.co', website: 'https://example.com', mapsUrl: 'https://maps.app.goo.gl/abc', rating: 4, quotePaise: 450000 })).toEqual({});
  });
});

describe('filterVendors', () => {
  const list = [
    v({ name: 'Zeta Hotel', category: 'hotel', status: 'rejected' }),
    v({ name: 'Alpha Homestay', category: 'homestay', status: 'quoted', phone: '98765 11111' }),
    v({ name: 'Beta Travels', category: 'travel_agent', status: 'booked', location: 'Sample Town' }),
    v({ name: 'Gamma Resort', category: 'resort', status: 'enquired', notes: 'pool, near lake' }),
  ];
  it('sorts booked first, rejected last', () => {
    expect(filterVendors(list, { q: '', category: '', status: '' }).map((x) => x.name)).toEqual(['Beta Travels', 'Alpha Homestay', 'Gamma Resort', 'Zeta Hotel']);
  });
  it('filters by category, status and search (text, notes, phone digits)', () => {
    expect(filterVendors(list, { q: '', category: 'hotel', status: '' }).map((x) => x.name)).toEqual(['Zeta Hotel']);
    expect(filterVendors(list, { q: '', category: '', status: 'quoted' }).map((x) => x.name)).toEqual(['Alpha Homestay']);
    expect(filterVendors(list, { q: 'lake', category: '', status: '' }).map((x) => x.name)).toEqual(['Gamma Resort']);
    expect(filterVendors(list, { q: 'sample town', category: '', status: '' }).map((x) => x.name)).toEqual(['Beta Travels']);
    expect(filterVendors(list, { q: '11111', category: '', status: '' }).map((x) => x.name)).toEqual(['Alpha Homestay']);
    expect(filterVendors(list, { q: 'travel agent', category: '', status: '' }).map((x) => x.name)).toEqual(['Beta Travels']);
  });
  it('counts by status', () => {
    expect(countByStatus(list)).toEqual({ shortlisted: 0, enquired: 1, quoted: 1, booked: 1, rejected: 1 });
  });
});
