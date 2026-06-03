import { describe, it, expect } from 'vitest';
import { batchSimpleCroppingCompat, performSimpleCropping, applyCroppingToWaveforms } from '../simple-front-rear-cropping';

describe('Simple Front-Rear Cropping', () => {
  it('should crop front and rear blanks correctly', () => {
    // 创建测试波形：前5个0，中间10个有效值，后5个0
    const signal = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0, 0, 0, 0];
    
    const result = batchSimpleCroppingCompat([
      { ch1: signal, ch2: signal, ch3: signal }
    ]);
    
    // batchSimpleCroppingCompat 返回 SimpleCroppingResult 对象，不是数组
    expect(result).toBeDefined();
    expect(result.startIdx).toBeLessThan(result.endIdx);
    expect(result.length).toBeGreaterThan(0);
    
    // 应用裁剪到波形
    const cropped = applyCroppingToWaveforms([
      { ch1: signal, ch2: signal, ch3: signal }
    ], result);
    
    expect(cropped).toHaveLength(1);
    expect(cropped[0].ch2.length).toBe(result.length);
  });

  it('should preserve all data between first and last valid signal', () => {
    // 前3个0，有效值1，低值0.1，有效值2，后3个0
    // 应该保留从第一个有效值到最后一个有效值之间的所有数据
    const signal = [0, 0, 0, 1, 0.1, 2, 0, 0, 0];
    
    const result = batchSimpleCroppingCompat([
      { ch1: signal, ch2: signal, ch3: signal }
    ]);
    
    expect(result).toBeDefined();
    expect(result.startIdx).toBeLessThan(result.endIdx);
    
    // 应用裁剪
    const cropped = applyCroppingToWaveforms([
      { ch1: signal, ch2: signal, ch3: signal }
    ], result);
    
    expect(cropped[0].ch2.length).toBe(result.length);
    // 验证保留了中间的低值部分
    expect(cropped[0].ch2).toContain(0.1);
  });

  it('should handle multiple collections with median aggregation', () => {
    const signal1 = [0, 0, 1, 2, 3, 0, 0];
    const signal2 = [0, 0, 2, 3, 4, 0, 0];
    
    const result = batchSimpleCroppingCompat([
      { ch1: signal1, ch2: signal1, ch3: signal1 },
      { ch1: signal2, ch2: signal2, ch3: signal2 }
    ]);
    
    expect(result).toBeDefined();
    expect(result.startIdx).toBeLessThan(result.endIdx);
    
    // 应用裁剪到两个波形
    const cropped = applyCroppingToWaveforms([
      { ch1: signal1, ch2: signal1, ch3: signal1 },
      { ch1: signal2, ch2: signal2, ch3: signal2 }
    ], result);
    
    expect(cropped).toHaveLength(2);
    expect(cropped[0].ch2.length).toBe(result.length);
    expect(cropped[1].ch2.length).toBe(result.length);
  });

  it('should not break waveform integrity', () => {
    // 验证裁剪不会删除中间的低值部分
    const signal = [0, 0, 0.1, 0.5, 0.2, 1, 0.3, 0, 0];
    
    const result = batchSimpleCroppingCompat([
      { ch1: signal, ch2: signal, ch3: signal }
    ]);
    
    expect(result).toBeDefined();
    expect(result.startIdx).toBeLessThan(result.endIdx);
    
    // 应用裁剪
    const cropped = applyCroppingToWaveforms([
      { ch1: signal, ch2: signal, ch3: signal }
    ], result);
    
    // 验证中间的低值被保留
    const croppedSignal = cropped[0].ch2;
    expect(croppedSignal).toContain(0.2);
    expect(croppedSignal).toContain(0.3);
  });

  it('should ensure startIdx < endIdx always', () => {
    // 测试各种边界情况
    const testCases = [
      [0, 0, 0, 1, 2, 3, 0, 0, 0],
      [1, 2, 3, 4, 5],
      [0, 0, 0, 0, 0, 0.1, 0, 0, 0],
    ];

    for (const signal of testCases) {
      const result = batchSimpleCroppingCompat([
        { ch1: signal, ch2: signal, ch3: signal }
      ]);

      // 关键验证：startIdx 必须小于 endIdx
      expect(result.startIdx).toBeLessThan(result.endIdx);
      expect(result.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle performSimpleCropping directly', () => {
    const signal = [0, 0, 0, 1, 2, 3, 4, 5, 0, 0, 0];
    
    const result = performSimpleCropping(signal, signal, signal);
    
    expect(result).toBeDefined();
    expect(result.startIdx).toBeLessThan(result.endIdx);
    expect(result.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });
});
