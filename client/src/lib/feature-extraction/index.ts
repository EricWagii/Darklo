/**
 * 统一的特征提取接口
 * 提供一致的特征提取 API
 */

export interface IFeatureExtractor {
  extract(signal: number[]): number[];
  getDimension(): number;
  getName(): string;
}

/**
 * 时域特征提取器
 */
export class TimeDomainExtractor implements IFeatureExtractor {
  extract(signal: number[]): number[] {
    if (signal.length === 0) {
      return new Array(this.getDimension()).fill(0);
    }

    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
    const std = Math.sqrt(variance);
    const rms = Math.sqrt(signal.reduce((a, b) => a + b ** 2, 0) / signal.length);

    // 峰值和谷值
    const max = Math.max(...signal);
    const min = Math.min(...signal);
    const peakToPeak = max - min;

    // 过零率
    let zc = 0;
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
        zc++;
      }
    }
    const zcr = zc / signal.length;

    // 波形因子
    const cf = max / rms;

    // 脉冲因子
    const if_ = max / mean;

    // 裕度因子
    const mf = max / Math.sqrt(Math.abs(mean));

    return [mean, std, rms, max, min, peakToPeak, zcr, cf, if_, mf];
  }

  getDimension(): number {
    return 10;
  }

  getName(): string {
    return 'TimeDomain';
  }
}

/**
 * 频域特征提取器
 */
export class FrequencyDomainExtractor implements IFeatureExtractor {
  private fftSize: number;

  constructor(fftSize: number = 512) {
    this.fftSize = fftSize;
  }

  extract(signal: number[]): number[] {
    // 简化版本：直接返回固定维度的特征
    // 实际使用中应调用 DSP 处理器的频域特征提取
    const features: number[] = [];

    // 频带能量特征（5 个频带）
    const bandCount = 5;
    for (let i = 0; i < bandCount; i++) {
      features.push(Math.random()); // 占位符
    }

    // 频谱熵
    features.push(Math.random());

    // 频谱质心
    features.push(Math.random());

    return features;
  }

  getDimension(): number {
    return 7;
  }

  getName(): string {
    return 'FrequencyDomain';
  }
}

/**
 * 组合特征提取器
 */
export class CombinedExtractor implements IFeatureExtractor {
  private extractors: IFeatureExtractor[];

  constructor(extractors: IFeatureExtractor[] = []) {
    this.extractors = extractors.length > 0 ? extractors : [new TimeDomainExtractor()];
  }

  extract(signal: number[]): number[] {
    const features: number[] = [];
    for (const extractor of this.extractors) {
      features.push(...extractor.extract(signal));
    }
    return features;
  }

  getDimension(): number {
    return this.extractors.reduce((sum, ext) => sum + ext.getDimension(), 0);
  }

  getName(): string {
    return `Combined(${this.extractors.map((e) => e.getName()).join('+')})`;
  }

  addExtractor(extractor: IFeatureExtractor): void {
    this.extractors.push(extractor);
  }
}

// 导出单例实例
export const timeDomainExtractor = new TimeDomainExtractor();
export const frequencyDomainExtractor = new FrequencyDomainExtractor();
export const combinedExtractor = new CombinedExtractor([timeDomainExtractor, frequencyDomainExtractor]);

export default {
  TimeDomainExtractor,
  FrequencyDomainExtractor,
  CombinedExtractor,
  timeDomainExtractor,
  frequencyDomainExtractor,
  combinedExtractor,
};
