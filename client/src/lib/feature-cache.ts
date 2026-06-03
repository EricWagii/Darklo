/**
 * FeatureCache - 特征提取缓存机制
 * 避免重复计算相同波形的特征，提升性能
 */

export interface CacheEntry {
  timestamp: number;
  features: number[];
}

export class FeatureCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number; // 缓存过期时间（毫秒）

  constructor(maxSize: number = 1000, ttl: number = 60000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 生成缓存键
   */
  private generateKey(waveform: { ch1: number[]; ch2: number[]; ch3: number[] }): string {
    const hash = (arr: number[]): number => {
      let h = 0;
      for (let i = 0; i < Math.min(arr.length, 100); i++) {
        h = ((h << 5) - h) + arr[i];
        h = h & h; // Convert to 32bit integer
      }
      return h;
    };

    const ch1Hash = hash(waveform.ch1);
    const ch2Hash = hash(waveform.ch2);
    const ch3Hash = hash(waveform.ch3);

    return `${ch1Hash}-${ch2Hash}-${ch3Hash}`;
  }

  /**
   * 获取缓存的特征，如果不存在则调用提取函数
   */
  get(
    waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
    extractor: (waveform: { ch1: number[]; ch2: number[]; ch3: number[] }) => number[]
  ): number[] {
    const key = this.generateKey(waveform);
    const entry = this.cache.get(key);

    // 检查缓存是否有效
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.features;
    }

    // 缓存过期或不存在，重新计算
    const features = extractor(waveform);
    this.set(key, features);

    return features;
  }

  /**
   * 设置缓存
   */
  private set(key: string, features: number[]): void {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      timestamp: Date.now(),
      features,
    });
  }

  /**
   * 删除指定缓存
   */
  invalidate(waveform: { ch1: number[]; ch2: number[]; ch3: number[] }): void {
    const key = this.generateKey(waveform);
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size / this.maxSize,
    };
  }
}

// 全局特征缓存实例
export const globalFeatureCache = new FeatureCache();

export default FeatureCache;
