import { describe, it, expect } from 'vitest';
import { cropByRestingBaseline, batchCroppingByRestingBaseline } from '../resting-baseline-cropping';

describe('双端静息估计法', () => {
  // 生成模拟信号
  function generateSignal(
    length: number,
    noiseLevel: number = 0.1,
    signalStart: number = 0.3,
    signalEnd: number = 0.7,
    signalAmplitude: number = 1.0
  ): number[] {
    const signal: number[] = [];
    for (let i = 0; i < length; i++) {
      const ratio = i / length;
      let value = Math.random() * noiseLevel; // 基础噪声

      // 在指定范围内添加信号
      if (ratio >= signalStart && ratio <= signalEnd) {
        value += signalAmplitude * Math.sin((ratio - signalStart) * Math.PI / (signalEnd - signalStart));
      }

      signal.push(value);
    }
    return signal;
  }

  it('应该正确裁剪包含清晰信号的波形', () => {
    const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    const result = cropByRestingBaseline(ch1, ch2, ch3);

    expect(result.method).toBe('resting-baseline');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.startIdx).toBeGreaterThan(0);
    expect(result.endIdx).toBeLessThan(1000);
    expect(result.startIdx).toBeLessThan(result.endIdx);
  });

  it('应该处理弱信号（降低snrMultiplier）', () => {
    const ch1 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3); // 弱信号
    const ch2 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);
    const ch3 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);

    const result = cropByRestingBaseline(ch1, ch2, ch3, 20, 0.08, 2.5); // 降低snrMultiplier

    expect(result.startIdx).toBeLessThan(result.endIdx);
    expect(result.method).toBe('resting-baseline');
  });

  it('应该在找不到有效信号时降级', () => {
    // 全噪声信号
    const ch1 = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch2 = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch3 = Array(1000).fill(0).map(() => Math.random() * 0.05);

    const result = cropByRestingBaseline(ch1, ch2, ch3);

    expect(result.method).toBe('degraded');
    expect(result.confidence).toBeLessThan(0.3);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(1000);
  });

  it('应该处理短信号', () => {
    const ch1 = Array(5).fill(0.5);
    const ch2 = Array(5).fill(0.5);
    const ch3 = Array(5).fill(0.5);

    const result = cropByRestingBaseline(ch1, ch2, ch3);

    expect(result.method).toBe('degraded');
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(5);
  });

  it('应该计算正确的置信度', () => {
    // 高对比度信号（强信号）
    const ch1 = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);
    const ch2 = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);
    const ch3 = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);

    const result = cropByRestingBaseline(ch1, ch2, ch3);

    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('应该批量处理多条波形', () => {
    const collections = Array(5).fill(null).map(() => ({
      ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
      ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
      ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
    }));

    const results = batchCroppingByRestingBaseline(collections);

    expect(results).toHaveLength(5);
    expect(results.every(r => r.startIdx < r.endIdx)).toBe(true);
  });

  it('应该独立处理每条波形（不受其他波形影响）', () => {
    // 波形1：清晰信号
    const ch1_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    // 波形2：噪声信号
    const ch1_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch2_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch3_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);

    // 单独处理
    const result_clear = cropByRestingBaseline(ch1_clear, ch2_clear, ch3_clear);
    const result_noise = cropByRestingBaseline(ch1_noise, ch2_noise, ch3_noise);

    // 结果应该不同
    expect(result_clear.confidence).toBeGreaterThan(result_noise.confidence);
    expect(result_clear.method).toBe('resting-baseline');
    expect(result_noise.method).toBe('degraded');
  });
});
