import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes and escapes', () => expect(toCsv([['a,b', 'x"y'], [1, 2]])).toBe('"a,b","x""y"\r\n1,2'));
  it('neutralises spreadsheet formulas', () => expect(toCsv([['=HYPERLINK("x")']])).toBe('"\'=HYPERLINK(""x"")"'));
});
