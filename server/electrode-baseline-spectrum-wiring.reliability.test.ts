import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('electrode baseline spectrum sample-rate wiring', () => {
  it('passes the measured rate from the accepted capture to the FFT', () => {
    const componentSource = readFileSync(
      new URL('../client/src/components/ElectrodeBaselineCapture.tsx', import.meta.url),
      'utf8'
    );

    expect(componentSource).toMatch(/const measuredSampleRate = snapshot\.measuredSampleRate/);
    expect(componentSource).toMatch(/computeFFT\(waveformBufferRef\.current\.ch2,\s*measuredSampleRate\)/);
  });
});
