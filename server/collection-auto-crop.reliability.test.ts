import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync(
  path.resolve(import.meta.dirname, '../client/src/pages/CollectionMode.tsx'),
  'utf8'
);

describe('collection batch auto-crop wiring', () => {
  it('aligns already normalized templates without re-running rate-dependent preprocessing', () => {
    const handler = page.split('const handleAutoCropAll = () => {')[1]?.split('// 注册数据接收回调')[0];
    expect(handler).toBeDefined();
    expect(handler).toContain('alignMultipleCollectionsImproved(');
    expect(handler).not.toContain('alignMultipleCollectionsAfterPreprocessing(');
    expect(handler).toContain('trimTrainingCollections(');
    expect(page).not.toContain("from '@/lib/preprocessing-aware-cropping'");
  });
});
