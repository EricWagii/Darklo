export interface MorseEntry {
  character: string;
  code: string;
  group: 'letter' | 'digit';
}

export interface MorseReferenceToken {
  character: string;
  code: string;
  kind: 'character' | 'word-boundary' | 'unsupported';
}

const LETTER_CODES = [
  ['A', '.-'], ['B', '-...'], ['C', '-.-.'], ['D', '-..'], ['E', '.'],
  ['F', '..-.'], ['G', '--.'], ['H', '....'], ['I', '..'], ['J', '.---'],
  ['K', '-.-'], ['L', '.-..'], ['M', '--'], ['N', '-.'], ['O', '---'],
  ['P', '.--.'], ['Q', '--.-'], ['R', '.-.'], ['S', '...'], ['T', '-'],
  ['U', '..-'], ['V', '...-'], ['W', '.--'], ['X', '-..-'], ['Y', '-.--'],
  ['Z', '--..'],
] as const;

const DIGIT_CODES = [
  ['0', '-----'], ['1', '.----'], ['2', '..---'], ['3', '...--'], ['4', '....-'],
  ['5', '.....'], ['6', '-....'], ['7', '--...'], ['8', '---..'], ['9', '----.'],
] as const;

export const MORSE_ENTRIES: readonly MorseEntry[] = Object.freeze([
  ...LETTER_CODES.map(([character, code]) => ({ character, code, group: 'letter' as const })),
  ...DIGIT_CODES.map(([character, code]) => ({ character, code, group: 'digit' as const })),
]);

export const MORSE_BY_CHARACTER: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(MORSE_ENTRIES.map(({ character, code }) => [character, code]))
);

export const CHARACTER_BY_MORSE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(MORSE_ENTRIES.map(({ character, code }) => [code, character]))
);

const VALID_PREFIXES = new Set(
  MORSE_ENTRIES.flatMap(({ code }) =>
    Array.from({ length: code.length }, (_, index) => code.slice(0, index + 1))
  )
);

export const decodeMorse = (code: string): string | null =>
  CHARACTER_BY_MORSE[code] ?? null;

export const isMorsePrefix = (code: string): boolean =>
  code.length > 0 && VALID_PREFIXES.has(code);

export const encodeMorseReference = (value: string): MorseReferenceToken[] =>
  Array.from(value.toUpperCase()).map((character) => {
    if (/\s/.test(character)) {
      return { character: ' ', code: '/', kind: 'word-boundary' };
    }

    const code = MORSE_BY_CHARACTER[character];
    return code
      ? { character, code, kind: 'character' }
      : { character, code: '?', kind: 'unsupported' };
  });
