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

  it('guides an uncalibrated session instead of silently disabling Start', () => {
    const source = readSource('client/src/pages/ContinuousCodeMode.tsx');
    expect(source).toContain('开始校准');
    expect(source).toContain('开始解码');
    expect(source).toContain('standbyLabel={streamStandbyLabel}');
    expect(source).not.toContain('disabled={!calibrationReady || (evaluationMode === \'scripted\' && !targetText)}');
  });

  it('shows stable and tentative streaming text using decoder evidence only', () => {
    const source = readSource('client/src/pages/ContinuousCodeMode.tsx');
    expect(source).toContain('getTentativeText(decoder)');
    expect(source).toContain('tentativeText=');
    expect(source).toContain('sessionClockRef.current.now()');
    expect(source).not.toContain('forceSplitDecoder(current, Date.now()');
  });
});
