import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../client/src/pages/CollectionMode.tsx', import.meta.url),
  'utf8',
);

describe('CollectionMode command batch ownership', () => {
  it('stores an immutable command name for the unsaved collection batch', () => {
    expect(source).toContain('sessionCommandName');
    expect(source).toContain('resolveCollectionSessionCommand');
  });

  it('prevents command edits while a batch is pending', () => {
    expect(source).toContain('isCommandInputLocked');
    expect(source).toMatch(/disabled=\{isCommandInputLocked\}/);
  });

  it('exposes an explicit per-command save action near the command input', () => {
    expect(source).toContain('当前采集指令');
    expect(source).toContain('保存当前指令');
  });
});
