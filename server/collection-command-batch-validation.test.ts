import { describe, expect, it, vi } from 'vitest';
import {
  handleCompleteCollectionV2,
  handleSaveAfterAnomalyRemoval,
} from '../client/src/lib/collection-handler-v2';

const waveform = {
  ch1: [0, 1, 0],
  ch2: [0, 2, 0],
  ch3: [0, 1, 0],
};

const buildConfig = () => ({
  commandName: 'V+',
  collectionHistory: [
    { commandName: 'play', timestamp: new Date(), waveform },
    { commandName: 'V+', timestamp: new Date(), waveform },
  ],
  currentUser: { userId: 'user-1', userName: 'Tester' },
  emgDatabase: {
    getCommand: vi.fn(),
    saveCommand: vi.fn(),
  },
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  operationLogger: { log: vi.fn() },
});

describe('collection batch command validation', () => {
  it('rejects a mixed-command batch before querying or writing IndexedDB', async () => {
    const config = buildConfig();

    const result = await handleCompleteCollectionV2(config);

    expect(result.success).toBe(false);
    expect(result.message).toContain('play');
    expect(result.message).toContain('V+');
    expect(config.emgDatabase.getCommand).not.toHaveBeenCalled();
    expect(config.emgDatabase.saveCommand).not.toHaveBeenCalled();
  });

  it('also rejects a mixed batch after anomaly review', async () => {
    const config = buildConfig();

    const result = await handleSaveAfterAnomalyRemoval(config, [], []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('混有多个指令');
    expect(config.emgDatabase.saveCommand).not.toHaveBeenCalled();
  });
});
