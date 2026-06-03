import { describe, it, expect } from 'vitest';
import { batchSimpleCroppingIndependent, applyIndependentCropping } from '../client/src/lib/simple-front-rear-cropping';

describe('问题1.2修复：批量独立裁剪', () => {
  describe('batchSimpleCroppingIndependent - 返回数组', () => {
    it('应该返回与输入长度相同的数组', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 100),
        },
        {
          ch1: new Array(1000).fill(0).map(() => Math.random() * 10 - 5),
          ch2: new Array(1000).fill(0).map(() => Math.random() * 10 - 5),
          ch3: new Array(1000).fill(0).map(() => Math.random() * 10 - 5),
        },
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 200) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 200) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 150) * 100),
        },
      ];

      const results = batchSimpleCroppingIndependent(waveforms);

      // 验证返回数组长度
      expect(results).toHaveLength(3);

      // 验证每条结果都有效
      results.forEach((result, index) => {
        expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
        expect(result.startIdx).toBeGreaterThanOrEqual(0);
        expect(result.endIdx).toBeLessThanOrEqual(1000);
        console.log(
          `第${index}条：[${result.startIdx}, ${result.endIdx}), 长度=${result.length}, 置信度=${result.confidence.toFixed(3)}`
        );
      });
    });

    it('应该每条独立处理，返回不同的结果', () => {
      // 创建3条不同的波形，每条有不同的信号强度
      const waveforms = [
        {
          // 第1条：弱信号
          ch1: new Array(1000).fill(0).map(() => Math.random() * 20 - 10),
          ch2: new Array(1000).fill(0).map(() => Math.random() * 20 - 10),
          ch3: new Array(1000).fill(0).map(() => Math.random() * 20 - 10),
        },
        {
          // 第2条：中等信号
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 100),
        },
        {
          // 第3条：强信号
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 200),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 200),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 200),
        },
      ];

      const results = batchSimpleCroppingIndependent(waveforms);

      // 验证每条都返回了结果
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
      });

      // 验证每条都返回了有效的结果
      console.log('\n独立裁剪结果：');
      results.forEach((r, i) => {
        console.log(`第${i}条：[${r.startIdx}, ${r.endIdx}), 长度=${r.length}, 置信度=${r.confidence.toFixed(3)}`);
      });
    });

    it('应该处理进度回调', () => {
      const waveforms = [
        {
          ch1: new Array(100).fill(1),
          ch2: new Array(100).fill(1),
          ch3: new Array(100).fill(1),
        },
        {
          ch1: new Array(100).fill(1),
          ch2: new Array(100).fill(1),
          ch3: new Array(100).fill(1),
        },
      ];

      const progressCalls: Array<[number, number]> = [];
      const onProgress = (current: number, total: number) => {
        progressCalls.push([current, total]);
      };

      const results = batchSimpleCroppingIndependent(waveforms, onProgress);

      expect(results).toHaveLength(2);
      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual([1, 2]);
      expect(progressCalls[1]).toEqual([2, 2]);
    });

    it('应该处理空波形数组', () => {
      const waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> = [];

      const results = batchSimpleCroppingIndependent(waveforms);

      expect(results).toHaveLength(0);
    });

    it('应该处理单条波形', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 100),
        },
      ];

      const results = batchSimpleCroppingIndependent(waveforms);

      expect(results).toHaveLength(1);
      expect(results[0].startIdx).toBeLessThanOrEqual(results[0].endIdx);
    });
  });

  describe('applyIndependentCropping - 应用独立裁剪', () => {
    it('应该每条使用对应的裁剪结果', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => i),
          ch2: new Array(1000).fill(0).map((_, i) => i),
          ch3: new Array(1000).fill(0).map((_, i) => i),
        },
        {
          ch1: new Array(1000).fill(0).map((_, i) => i * 2),
          ch2: new Array(1000).fill(0).map((_, i) => i * 2),
          ch3: new Array(1000).fill(0).map((_, i) => i * 2),
        },
      ];

      const croppingResults = [
        {
          startIdx: 100,
          endIdx: 900,
          length: 800,
          confidence: 0.9,
          isQualityAcceptable: true,
        },
        {
          startIdx: 200,
          endIdx: 800,
          length: 600,
          confidence: 0.8,
          isQualityAcceptable: true,
        },
      ];

      const croppedWaveforms = applyIndependentCropping(waveforms, croppingResults);

      expect(croppedWaveforms).toHaveLength(2);

      // 验证第1条裁剪
      expect(croppedWaveforms[0].ch1).toHaveLength(800);
      expect(croppedWaveforms[0].ch1[0]).toBe(100);
      expect(croppedWaveforms[0].ch1[799]).toBe(899);

      // 验证第2条裁剪
      expect(croppedWaveforms[1].ch1).toHaveLength(600);
      expect(croppedWaveforms[1].ch1[0]).toBe(400); // 200 * 2
      expect(croppedWaveforms[1].ch1[599]).toBe(1598); // 799 * 2
    });

    it('应该处理长度不匹配的情况', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(1),
          ch2: new Array(1000).fill(1),
          ch3: new Array(1000).fill(1),
        },
      ];

      const croppingResults = [
        {
          startIdx: 100,
          endIdx: 900,
          length: 800,
          confidence: 0.9,
          isQualityAcceptable: true,
        },
        {
          startIdx: 200,
          endIdx: 800,
          length: 600,
          confidence: 0.8,
          isQualityAcceptable: true,
        },
      ];

      // 应该只处理最小数量
      const croppedWaveforms = applyIndependentCropping(waveforms, croppingResults);

      expect(croppedWaveforms).toHaveLength(1);
      expect(croppedWaveforms[0].ch1).toHaveLength(800);
    });

    it('应该处理无效索引（反序）', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => i),
          ch2: new Array(1000).fill(0).map((_, i) => i),
          ch3: new Array(1000).fill(0).map((_, i) => i),
        },
      ];

      const croppingResults = [
        {
          startIdx: 900,
          endIdx: 100, // 反序
          length: -800,
          confidence: 0.9,
          isQualityAcceptable: false,
        },
      ];

      const croppedWaveforms = applyIndependentCropping(waveforms, croppingResults);

      // 应该返回全段
      expect(croppedWaveforms).toHaveLength(1);
      expect(croppedWaveforms[0].ch1).toHaveLength(1000);
    });

    it('应该处理边界情况：startIdx=0, endIdx=length', () => {
      const waveforms = [
        {
          ch1: new Array(500).fill(0).map((_, i) => i),
          ch2: new Array(500).fill(0).map((_, i) => i),
          ch3: new Array(500).fill(0).map((_, i) => i),
        },
      ];

      const croppingResults = [
        {
          startIdx: 0,
          endIdx: 500,
          length: 500,
          confidence: 1.0,
          isQualityAcceptable: true,
        },
      ];

      const croppedWaveforms = applyIndependentCropping(waveforms, croppingResults);

      expect(croppedWaveforms).toHaveLength(1);
      expect(croppedWaveforms[0].ch1).toHaveLength(500);
      expect(croppedWaveforms[0].ch1[0]).toBe(0);
      expect(croppedWaveforms[0].ch1[499]).toBe(499);
    });

    it('应该处理空波形数组', () => {
      const waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> = [];
      const croppingResults: any[] = [];

      const croppedWaveforms = applyIndependentCropping(waveforms, croppingResults);

      expect(croppedWaveforms).toHaveLength(0);
    });
  });

  describe('与旧API的兼容性', () => {
    it('新函数应该返回数组结构', () => {
      const waveforms = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 100),
        },
      ];

      const independentResults = batchSimpleCroppingIndependent(waveforms);

      // 新函数返回数组
      expect(Array.isArray(independentResults)).toBe(true);
      expect(independentResults).toHaveLength(1);

      // 每个结果都是SimpleCroppingResult
      const result = independentResults[0];
      expect(result).toHaveProperty('startIdx');
      expect(result).toHaveProperty('endIdx');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('isQualityAcceptable');
    });
  });
});
