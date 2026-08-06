import { describe, expect, it } from 'vitest';
import {
  CHARACTER_BY_MORSE,
  MORSE_BY_CHARACTER,
  MORSE_ENTRIES,
  decodeMorse,
  isMorsePrefix,
} from '../client/src/lib/morse-code';

describe('canonical Morse mapping', () => {
  it('contains every Latin letter and decimal digit exactly once', () => {
    expect(MORSE_ENTRIES).toHaveLength(36);
    expect(new Set(MORSE_ENTRIES.map((entry) => entry.character)).size).toBe(36);
    expect(new Set(MORSE_ENTRIES.map((entry) => entry.code)).size).toBe(36);

    for (const character of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(MORSE_BY_CHARACTER[character]).toMatch(/^[.-]+$/);
    }
  });

  it('uses the same mapping for forward, reverse, and display lookups', () => {
    expect(MORSE_BY_CHARACTER.A).toBe('.-');
    expect(MORSE_BY_CHARACTER.S).toBe('...');
    expect(MORSE_BY_CHARACTER['0']).toBe('-----');
    expect(CHARACTER_BY_MORSE['.-']).toBe('A');
    expect(decodeMorse('...')).toBe('S');
    expect(decodeMorse('-----')).toBe('0');
  });

  it('identifies valid partial sequences without accepting unknown codes', () => {
    expect(isMorsePrefix('.-')).toBe(true);
    expect(isMorsePrefix('....-')).toBe(true);
    expect(isMorsePrefix('......')).toBe(false);
    expect(decodeMorse('......')).toBeNull();
  });
});
