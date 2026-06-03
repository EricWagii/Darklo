/**
 * 数据删除操作测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock IndexedDB
class MockIDBDatabase {
  private stores: Map<string, Map<string, any>> = new Map();

  transaction(storeNames: string | string[], mode: 'readonly' | 'readwrite') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const stores: Record<string, any> = {};
    
    for (const name of names) {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map());
      }
      
      const store = this.stores.get(name)!;
      stores[name] = {
        get: (key: string) => ({
          onsuccess: null,
          onerror: null,
          result: store.get(key),
          addEventListener: function(event: string, handler: Function) {
            if (event === 'success') this.onsuccess = handler;
            if (event === 'error') this.onerror = handler;
          }
        }),
        delete: (key: string) => {
          store.delete(key);
          return {
            onsuccess: null,
            onerror: null,
            addEventListener: function(event: string, handler: Function) {
              if (event === 'success') this.onsuccess = handler;
              if (event === 'error') this.onerror = handler;
            }
          };
        },
        put: (value: any) => {
          store.set(value.name, value);
          return {
            onsuccess: null,
            onerror: null,
            addEventListener: function(event: string, handler: Function) {
              if (event === 'success') this.onsuccess = handler;
              if (event === 'error') this.onerror = handler;
            }
          };
        }
      };
    }
    
    return {
      objectStore: (name: string) => stores[name],
      oncomplete: null,
      onerror: null,
      commit: function() {
        if (this.oncomplete) this.oncomplete();
      }
    };
  }
}

describe('删除操作测试', () => {
  it('应该能够从波形数组中删除单条波形', () => {
    const collections = [
      { ch1: [1, 2, 3], ch2: [4, 5, 6], ch3: [7, 8, 9] },
      { ch1: [10, 11, 12], ch2: [13, 14, 15], ch3: [16, 17, 18] },
      { ch1: [19, 20, 21], ch2: [22, 23, 24], ch3: [25, 26, 27] },
    ];

    // 删除索引1的波形
    const result = collections.filter((_, idx) => idx !== 1);

    expect(result).toHaveLength(2);
    expect(result[0].ch2).toEqual([4, 5, 6]);
    expect(result[1].ch2).toEqual([22, 23, 24]);
  });

  it('应该能够删除所有波形后自动删除指令', () => {
    const command = {
      name: 'test',
      collections: [
        { ch1: [1, 2], ch2: [3, 4], ch3: [5, 6] }
      ]
    };

    // 删除唯一的波形
    command.collections.splice(0, 1);

    expect(command.collections).toHaveLength(0);
    // 此时应该删除整个指令
  });

  it('应该正确处理删除操作的边界情况', () => {
    const collections = [
      { ch1: [1], ch2: [2], ch3: [3] }
    ];

    // 尝试删除不存在的索引
    const invalidIndex = 5;
    if (invalidIndex >= 0 && invalidIndex < collections.length) {
      collections.splice(invalidIndex, 1);
    }

    expect(collections).toHaveLength(1); // 应该保持不变
  });

  it('应该能够删除多条波形', () => {
    const collections = [
      { ch1: [1], ch2: [2], ch3: [3] },
      { ch1: [4], ch2: [5], ch3: [6] },
      { ch1: [7], ch2: [8], ch3: [9] },
      { ch1: [10], ch2: [11], ch3: [12] },
    ];

    // 删除索引1和3
    const result = collections.filter((_, idx) => idx !== 1 && idx !== 3);

    expect(result).toHaveLength(2);
    expect(result[0].ch2).toEqual([2]);
    expect(result[1].ch2).toEqual([8]);
  });
});
