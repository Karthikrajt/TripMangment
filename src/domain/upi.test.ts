import { describe, expect, it } from 'vitest';
import { isValidUpiId, normaliseUpiId, upiPayUrl } from './upi';

describe('upi', () => {
  it('validates UPI IDs', () => {
    expect(isValidUpiId('ravi.k@okicici')).toBe(true);
    expect(isValidUpiId(' Ravi.K@OKSBI ')).toBe(true);
    expect(isValidUpiId('9876543210@ybl')).toBe(true);
    expect(isValidUpiId('ravi')).toBe(false);
    expect(isValidUpiId('@okicici')).toBe(false);
    expect(isValidUpiId('ravi@1bank')).toBe(false);
  });
  it('normalises', () => expect(normaliseUpiId(' A.B @Ybl ')).toBe('a.b@ybl'));
  it('builds a pay link with amount in rupees', () => {
    const url = upiPayUrl({ upiId: 'Test.User@okaxis', name: 'Test User', amountPaise: 123456, note: 'Trip settlement' });
    expect(url.startsWith('upi://pay?')).toBe(true);
    const q = new URLSearchParams(url.slice('upi://pay?'.length));
    expect(q.get('pa')).toBe('test.user@okaxis');
    expect(q.get('am')).toBe('1234.56');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('pn')).toBe('Test User');
    expect(url).not.toContain('+');
  });
});
