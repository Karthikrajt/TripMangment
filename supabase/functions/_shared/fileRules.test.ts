import { describe, expect, it } from 'vitest';
import { buildPath, parsePath, validateFileMeta } from './fileRules';

describe('validateFileMeta', () => {
  it('accepts a PDF ticket', () => {
    expect(validateFileMeta('ticket', 'pnr.pdf', 'application/pdf', 1000)).toEqual({ ok: true, ext: 'pdf', mime: 'application/pdf' });
  });
  it('accepts JPG/JPEG/PNG tickets', () => {
    expect(validateFileMeta('ticket', 'a.JPG', 'image/jpeg', 10).ok).toBe(true);
    expect(validateFileMeta('ticket', 'a.jpeg', 'image/jpeg', 10).ok).toBe(true);
    expect(validateFileMeta('ticket', 'a.png', 'image/png', 10).ok).toBe(true);
  });
  it('rejects disallowed extensions', () => {
    expect(validateFileMeta('ticket', 'a.exe', 'application/octet-stream', 10).ok).toBe(false);
    expect(validateFileMeta('ticket', 'a.webp', 'image/webp', 10).ok).toBe(false);
  });
  it('rejects mismatched MIME type', () => {
    expect(validateFileMeta('ticket', 'a.pdf', 'image/png', 10).ok).toBe(false);
  });
  it('rejects oversized and empty files', () => {
    expect(validateFileMeta('ticket', 'a.pdf', 'application/pdf', 6 * 1024 * 1024).ok).toBe(false);
    expect(validateFileMeta('ticket', 'a.pdf', 'application/pdf', 0).ok).toBe(false);
  });
});

describe('paths', () => {
  it('round-trips', () => {
    const p = buildPath('main', 'ticket', 'uid123', 'abc-DEF_1', 'pdf');
    expect(parsePath(p)).toEqual({ tripId: 'main', kind: 'ticket', ownerUid: 'uid123', file: 'abc-DEF_1.pdf' });
  });
  it('rejects traversal and foreign layouts', () => {
    expect(parsePath('trips/main/ticket/../x.pdf')).toBeNull();
    expect(parsePath('trips/main/ticket/u/a/b.pdf')).toBeNull();
    expect(parsePath('other/main/ticket/u/b.pdf')).toBeNull();
    expect(parsePath('trips/main/secret/u/b.pdf')).toBeNull();
  });
});
