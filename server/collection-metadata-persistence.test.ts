import { describe, expect, it } from 'vitest';
import { buildPersistedCollectionRecord } from '../client/src/lib/collection-handler-v2';

describe('collection metadata persistence', () => {
  it('preserves startup artifact and resting-baseline metadata', () => {
    const startupArtifact = {
      detected: true,
      ambiguous: true,
      suppressedSamples: 0,
      artifactRatio: 7.5,
      stabilizationIndex: null,
      reason: 'ambiguous startup',
    };
    const record = buildPersistedCollectionRecord({
      waveform: {
        ch1: [1],
        ch2: [2],
        ch3: [3],
        meta: {
          croppingMeta: { stage: 'final-fallback' },
          normalizationMeta: { targetLength: 512 },
          pipelineMetadata: { qualityScore: 25, startupArtifact },
          preprocessingMeta: {
            pipelineVersion: 'resting-baseline-v1',
            requiresRestingBaseline: true,
          },
        },
      },
      index: 4,
      currentUser: { userId: 'u1', userName: 'tester' },
      now: 1234,
    });

    expect(record.pipelineMetadata.startupArtifact).toEqual(startupArtifact);
    expect(record.preprocessingMeta.pipelineVersion).toBe('resting-baseline-v1');
    expect(record.index).toBe(4);
  });
});
