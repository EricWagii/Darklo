import { describe, expect, it } from 'vitest';
import {
  isCollectionCommandInputLocked,
  resolveCollectionSessionCommand,
} from '../client/src/lib/collection-command-session';

describe('collection command session', () => {
  it('keeps the first collected command when the draft input later changes', () => {
    expect(resolveCollectionSessionCommand('V+', 'play')).toBe('play');
  });

  it('normalizes a new command before binding the first sample', () => {
    expect(resolveCollectionSessionCommand('  V+  ', null)).toBe('V+');
  });

  it('locks the command input while unsaved samples exist', () => {
    expect(isCollectionCommandInputLocked({
      sessionCommandName: 'play',
      unsavedCount: 5,
      isCollecting: false,
      countdownTime: 0,
      isSaving: false,
    })).toBe(true);
  });

  it('unlocks the command input after the batch is saved or discarded', () => {
    expect(isCollectionCommandInputLocked({
      sessionCommandName: null,
      unsavedCount: 0,
      isCollecting: false,
      countdownTime: 0,
      isSaving: false,
    })).toBe(false);
  });
});
