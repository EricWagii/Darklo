import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('continuous code page layout', () => {
  it('integrates the waveform into the stream panel instead of a separate card', () => {
    const source = readSource('client/src/pages/ContinuousCodeMode.tsx');
    expect(source).toContain('waveform={{');
    expect(source).not.toContain('<ContinuousEmgWaveform');
  });

  it('renders the Morse reference as a compact matrix without per-character cards', () => {
    const source = readSource('client/src/pages/ContinuousCodeMode.tsx');
    expect(source).toContain('data-role="compact-morse-reference"');
    expect(source).not.toContain('<Card key={character}');
  });
});
