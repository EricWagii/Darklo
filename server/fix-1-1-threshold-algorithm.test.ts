import { describe, it, expect, beforeEach } from 'vitest';
import { cropByRestingBaseline, batchCroppingByRestingBaseline } from '../client/src/lib/resting-baseline-cropping';

describe('问题1.1修复：阈值算法边界检查和反序防护', () => {
  describe('cropByRestingBaseline - 边界检查', () => {
    it('应该处理边界情况：endIdx超出范围时应该被限制', () => {
      // 创建一个长信号，头尾都有静息段
      const length = 2000;
      const ch1 = new Array(length).fill(0);
      const ch2 = new Array(length).fill(0);
      const ch3 = new Array(length).fill(0);

      // 在中间添加强信号
      for (let i = 500; i < 1500; i++) {
        ch1[i] = Math.sin(i / 100) * 100;
        ch2[i] = Math.cos(i / 100) * 100;
        ch3[i] = Math.sin(i / 50) * 100;
      }

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 验证索引有效性
      expect(result.startIdx).toBeGreaterThanOrEqual(0);
      expect(result.endIdx).toBeLessThanOrEqual(length);
      expect(result.startIdx).toBeLessThan(result.endIdx);
    });

    it('应该处理弱信号：不返回startIdx=-1', () => {
      // 创建一个弱信号
      const length = 1000;
      const ch1 = new Array(length).fill(0).map(() => Math.random() * 5 - 2.5); // 弱噪声
      const ch2 = new Array(length).fill(0).map(() => Math.random() * 5 - 2.5);
      const ch3 = new Array(length).fill(0).map(() => Math.random() * 5 - 2.5);

      // 在中间添加稍强的信号
      for (let i = 300; i < 700; i++) {
        ch1[i] += Math.sin(i / 50) * 10;
        ch2[i] += Math.cos(i / 50) * 10;
        ch3[i] += Math.sin(i / 30) * 10;
      }

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 关键验证：不应该返回-1
      expect(result.startIdx).not.toBe(-1);
      expect(result.endIdx).not.toBe(-1);
      expect(result.startIdx).toBeLessThan(result.endIdx);
    });

    it('应该处理强信号：保留有效段，不过度裁剪', () => {
      // 创建一个强信号
      const length = 2000;
      const ch1 = new Array(length).fill(0);
      const ch2 = new Array(length).fill(0);
      const ch3 = new Array(length).fill(0);

      // 在中间添加强信号
      for (let i = 400; i < 1600; i++) {
        ch1[i] = Math.sin(i / 50) * 200;
        ch2[i] = Math.cos(i / 50) * 200;
        ch3[i] = Math.sin(i / 30) * 200;
      }

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 验证裁剪结果
      expect(result.startIdx).toBeGreaterThan(0);
      expect(result.endIdx).toBeLessThan(length);
      expect(result.startIdx).toBeLessThan(result.endIdx);

      // 验证有效段被保留
      const croppedLength = result.endIdx - result.startIdx;
      expect(croppedLength).toBeGreaterThan(500); // 应该保留大部分有效段
    });
  });

  describe('cropByRestingBaseline - 反序防护', () => {
    it('应该检测并修复反序索引', () => {
      // 创建一个特殊的信号，可能导致反序
      const length = 500;
      const ch1 = new Array(length).fill(0);
      const ch2 = new Array(length).fill(0);
      const ch3 = new Array(length).fill(0);

      // 添加一个非常短的信号
      for (let i = 200; i < 220; i++) {
        ch1[i] = 50;
        ch2[i] = 50;
        ch3[i] = 50;
      }

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 验证反序防护
      expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
      expect(result.endIdx - result.startIdx).toBeGreaterThan(0);
    });

    it('应该在长度无效时返回全段', () => {
      // 创建一个没有明显信号的数据
      const length = 100;
      const ch1 = new Array(length).fill(0).map(() => Math.random() * 2 - 1);
      const ch2 = new Array(length).fill(0).map(() => Math.random() * 2 - 1);
      const ch3 = new Array(length).fill(0).map(() => Math.random() * 2 - 1);

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 验证返回全段
      expect(result.startIdx).toBe(0);
      expect(result.endIdx).toBeLessThanOrEqual(length);
      expect(result.startIdx).toBeLessThan(result.endIdx);
    });
  });

  describe('batchCroppingByRestingBaseline - 批量独立裁剪', () => {
    it('应该每条独立裁剪，返回数组长度等于输入长度', () => {
      const collections = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 50),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 50),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 50),
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

      const results = batchCroppingByRestingBaseline(collections);

      // 验证返回长度
      expect(results).toHaveLength(3);

      // 验证每条结果都有效
      results.forEach((result, index) => {
        expect(result.startIdx).toBeLessThan(result.endIdx);
        expect(result.startIdx).toBeGreaterThanOrEqual(0);
        expect(result.endIdx).toBeLessThanOrEqual(1000);
        console.log(`第${index}条：[${result.startIdx}, ${result.endIdx}], 置信度=${result.confidence.toFixed(2)}`);
      });
    });

    it('应该处理混合数据：一条噪声不影响其他条', () => {
      const collections = [
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 100) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 50) * 100),
        },
        {
          // 第2条是纯噪声
          ch1: new Array(1000).fill(0).map(() => Math.random() * 5 - 2.5),
          ch2: new Array(1000).fill(0).map(() => Math.random() * 5 - 2.5),
          ch3: new Array(1000).fill(0).map(() => Math.random() * 5 - 2.5),
        },
        {
          ch1: new Array(1000).fill(0).map((_, i) => Math.sin(i / 150) * 100),
          ch2: new Array(1000).fill(0).map((_, i) => Math.cos(i / 150) * 100),
          ch3: new Array(1000).fill(0).map((_, i) => Math.sin(i / 100) * 100),
        },
      ];

      const results = batchCroppingByRestingBaseline(collections);

      // 验证每条都返回有效结果
      results.forEach((result) => {
        expect(result.startIdx).toBeLessThan(result.endIdx);
        expect(result.startIdx).toBeGreaterThanOrEqual(0);
        expect(result.endIdx).toBeLessThanOrEqual(1000);
      });

      // 验证所有置信度都是有效的数值
      results.forEach((result) => {
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('边界情况处理', () => {
    it('应该处理非常短的信号', () => {
      const ch1 = [1, 2, 3, 4, 5];
      const ch2 = [1, 2, 3, 4, 5];
      const ch3 = [1, 2, 3, 4, 5];

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 应该返回全段或有效结果
      expect(result.startIdx).toBeGreaterThanOrEqual(0);
      expect(result.endIdx).toBeLessThanOrEqual(5);
    });

    it('应该处理空信号', () => {
      const ch1: number[] = [];
      const ch2: number[] = [];
      const ch3: number[] = [];

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 应该返回有效结果（即使是空的）
      expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
    });

    it('应该处理全零信号', () => {
      const ch1 = new Array(1000).fill(0);
      const ch2 = new Array(1000).fill(0);
      const ch3 = new Array(1000).fill(0);

      const result = cropByRestingBaseline(ch1, ch2, ch3, 20);

      // 应该返回全段
      expect(result.startIdx).toBe(0);
      expect(result.endIdx).toBeLessThanOrEqual(1000);
    });
  });
});
