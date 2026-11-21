import { describe, expect, it } from 'vitest';
import { daysUntil, formatDate, formatTime, todayIST } from './format';

describe('format', () => {
  it('formats DD-MM-YYYY', () => expect(formatDate('2026-12-05')).toBe('05-12-2026'));
  it('formats 12-hour time', () => {
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('21:30')).toBe('9:30 PM');
  });
  it('uses Asia/Kolkata for today', () => {
    // 20:00 UTC on Dec 1 is 01:30 IST on Dec 2
    expect(todayIST(new Date('2026-12-01T20:00:00Z'))).toBe('2026-12-02');
  });
  it('counts days in IST', () => {
    expect(daysUntil('2026-12-05', new Date('2026-12-01T20:00:00Z'))).toBe(3);
  });
});
