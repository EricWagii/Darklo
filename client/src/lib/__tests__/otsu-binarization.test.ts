import { describe, it, expect } from 'vitest';
import { otsuThreshold, cropByOtsu, batchCroppingByOtsu } from '../otsu-binarization';

describe('Otsu二值化', () => {
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
      let value = Math.random() * noiseLevel;

      if (ratio >= signalStart && ratio <= signalEnd) {
        value += signalAmplitude * Math.sin((ratio - signalStart) * Math.PI / (signalEnd - signalStart));
      }

      signal.push(value);
    }
    return signal;
  }

  it('应该计算合理的Otsu阈值', () => {
    const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    // 计算能量
    const energy: number[] = [];
    for (let i = 0; i < 1000; i += 20) {
      let sum = 0;
      for (let j = 0; j < 20 && i + j < 1000; j++) {
        sum += ch1[i + j] ** 2 + ch2[i + j] ** 2 + ch3[i + j] ** 2;
      }
      energy.push(Math.sqrt(sum / 60));
    }

    const threshold = otsuThreshold(energy);

    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(Math.max(...energy));
  });

  it('应该正确裁剪包含清晰信号的波形', () => {
    const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    const result = cropByOtsu(ch1, ch2, ch3);

    expect(result.method).toBe('otsu');
    expect(result.startIdx).toBeGreaterThan(0);
    expect(result.endIdx).toBeLessThan(1000);
    expect(result.startIdx).toBeLessThan(result.endIdx);
    expect(result.activeRatio).toBeGreaterThan(0.1);
    expect(result.activeRatio).toBeLessThan(0.9);
  });

  it('应该处理弱信号', () => {
    const ch1 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);
    const ch2 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);
    const ch3 = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);

    const result = cropByOtsu(ch1, ch2, ch3);

    expect(result.startIdx).toBeLessThan(result.endIdx);
    expect(result.method).toBe('otsu');
  });

  it('应该在SNR很低时降级', () => {
    // 全噪声信号
    const ch1 = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch2 = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch3 = Array(1000).fill(0).map(() => Math.random() * 0.05);

    const result = cropByOtsu(ch1, ch2, ch3);

    // 有效段占比应该很高或很低（说明SNR低）
    expect(result.activeRatio < 0.1 || result.activeRatio > 0.9).toBe(true);
  });

  it('应该处理短信号', () => {
    const ch1 = Array(5).fill(0.5);
    const ch2 = Array(5).fill(0.5);
    const ch3 = Array(5).fill(0.5);

    const result = cropByOtsu(ch1, ch2, ch3);

    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(5);
  });

  it('应该计算正确的有效段占比', () => {
    const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    const result = cropByOtsu(ch1, ch2, ch3);

    // 有效段占比应该接近40%（从30%到70%）
    expect(result.activeRatio).toBeGreaterThan(0.3);
    expect(result.activeRatio).toBeLessThan(0.5);
  });

  it('应该批量处理多条波形', () => {
    const collections = Array(5).fill(null).map(() => ({
      ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
      ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
      ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
    }));

    const results = batchCroppingByOtsu(collections);

    expect(results).toHaveLength(5);
    expect(results.every(r => r.startIdx < r.endIdx)).toBe(true);
  });

  it('应该对不同强度的信号自适应', () => {
    // 弱信号
    const ch1_weak = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);
    const ch2_weak = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);
    const ch3_weak = generateSignal(1000, 0.2, 0.3, 0.7, 0.3);

    // 强信号
    const ch1_strong = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);
    const ch2_strong = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);
    const ch3_strong = generateSignal(1000, 0.05, 0.3, 0.7, 2.0);

    const result_weak = cropByOtsu(ch1_weak, ch2_weak, ch3_weak);
    const result_strong = cropByOtsu(ch1_strong, ch2_strong, ch3_strong);

    // 两者都应该成功裁剪
    expect(result_weak.startIdx).toBeLessThan(result_weak.endIdx);
    expect(result_strong.startIdx).toBeLessThan(result_strong.endIdx);
  });

  it('应该独立处理每条波形', () => {
    // 波形1：清晰信号
    const ch1_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch2_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
    const ch3_clear = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

    // 波形2：噪声信号
    const ch1_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch2_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);
    const ch3_noise = Array(1000).fill(0).map(() => Math.random() * 0.05);

    const result_clear = cropByOtsu(ch1_clear, ch2_clear, ch3_clear);
    const result_noise = cropByOtsu(ch1_noise, ch2_noise, ch3_noise);

    // 结果应该不同
    expect(result_clear.confidence).toBeGreaterThan(result_noise.confidence);
  });
});
