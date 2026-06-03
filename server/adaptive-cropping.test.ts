import { describe, it, expect } from 'vitest';

/**
 * 自适应长度裁剪和时间规范化测试
 */

describe('自适应长度裁剪策略', () => {
  describe('长度分析', () => {
    it('应该正确计算指令的长度统计', () => {
      const lengths = [500, 520, 510, 530, 515];
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const min = Math.min(...lengths);
      const max = Math.max(...lengths);

      expect(avg).toBeCloseTo(515, 0);
      expect(min).toBe(500);
      expect(max).toBe(530);
    });

    it('应该计算长度的标准差', () => {
      const lengths = [500, 520, 510, 530, 515];
      const avg = 515;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);

      expect(stdDev).toBeGreaterThan(0);
      expect(stdDev).toBeLessThan(20);
    });

    it('应该判断长度变异程度', () => {
      // 低变异
      const lowVar = [500, 502, 501, 503, 500];
      const lowAvg = lowVar.reduce((a, b) => a + b, 0) / lowVar.length;
      const lowVariance = lowVar.reduce((sum, len) => sum + Math.pow(len - lowAvg, 2), 0) / lowVar.length;
      const lowStdDev = Math.sqrt(lowVariance);
      const lowCV = lowStdDev / lowAvg;

      expect(lowCV).toBeLessThan(0.1);

      // 高变异
      const highVar = [300, 400, 500, 600, 700];
      const highAvg = highVar.reduce((a, b) => a + b, 0) / highVar.length;
      const highVariance = highVar.reduce((sum, len) => sum + Math.pow(len - highAvg, 2), 0) / highVar.length;
      const highStdDev = Math.sqrt(highVariance);
      const highCV = highStdDev / highAvg;

      expect(highCV).toBeGreaterThan(0.25);
    });
  });

  describe('重采样', () => {
    it('应该将波形重采样到目标长度', () => {
      const waveform = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const targetLength = 5;

      // 简单的线性插值重采样
      const normalized: number[] = [];
      const scaleFactor = (waveform.length - 1) / (targetLength - 1);

      for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * scaleFactor;
        const srcIdxFloor = Math.floor(srcIdx);
        const srcIdxCeil = Math.ceil(srcIdx);
        const frac = srcIdx - srcIdxFloor;

        if (srcIdxFloor === srcIdxCeil) {
          normalized.push(waveform[srcIdxFloor]);
        } else {
          const v1 = waveform[srcIdxFloor];
          const v2 = waveform[srcIdxCeil];
          normalized.push(v1 * (1 - frac) + v2 * frac);
        }
      }

      expect(normalized.length).toBe(5);
      expect(normalized[0]).toBe(0);
      expect(normalized[4]).toBe(9);
    });

    it('应该处理上采样情况', () => {
      const waveform = [0, 5, 10];
      const targetLength = 6;

      const normalized: number[] = [];
      const scaleFactor = (waveform.length - 1) / (targetLength - 1);

      for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * scaleFactor;
        const srcIdxFloor = Math.floor(srcIdx);
        const srcIdxCeil = Math.ceil(srcIdx);
        const frac = srcIdx - srcIdxFloor;

        if (srcIdxFloor === srcIdxCeil) {
          normalized.push(waveform[srcIdxFloor]);
        } else {
          const v1 = waveform[srcIdxFloor];
          const v2 = waveform[srcIdxCeil];
          normalized.push(v1 * (1 - frac) + v2 * frac);
        }
      }

      expect(normalized.length).toBe(6);
      expect(normalized[0]).toBe(0);
      expect(normalized[5]).toBe(10);
    });

    it('应该处理下采样情况', () => {
      const waveform = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const targetLength = 3;

      const normalized: number[] = [];
      const scaleFactor = (waveform.length - 1) / (targetLength - 1);

      for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * scaleFactor;
        const srcIdxFloor = Math.floor(srcIdx);
        const srcIdxCeil = Math.ceil(srcIdx);
        const frac = srcIdx - srcIdxFloor;

        if (srcIdxFloor === srcIdxCeil) {
          normalized.push(waveform[srcIdxFloor]);
        } else {
          const v1 = waveform[srcIdxFloor];
          const v2 = waveform[srcIdxCeil];
          normalized.push(v1 * (1 - frac) + v2 * frac);
        }
      }

      expect(normalized.length).toBe(3);
      expect(normalized[0]).toBe(0);
      expect(normalized[2]).toBe(9);
    });

    it('应该计算重采样质量评分', () => {
      // 缩放因子接近1时质量高
      const scaleFactor1 = 1.1;
      const quality1 = Math.max(0.5, 1 - Math.abs(scaleFactor1 - 1) * 0.5);
      expect(quality1).toBeGreaterThan(0.9);

      // 缩放因子差异大时质量低
      const scaleFactor2 = 0.5;
      const quality2 = Math.max(0.5, 1 - Math.abs(scaleFactor2 - 1) * 0.5);
      expect(quality2).toBeLessThan(0.8);
    });
  });

  describe('DTW距离计算', () => {
    it('应该计算两个序列的DTW距离', () => {
      const seq1 = [0, 1, 2, 3];
      const seq2 = [0, 1, 2, 3];

      // 相同序列的DTW距离应该是0
      const n = seq1.length;
      const m = seq2.length;

      const dtw: number[][] = Array(n + 1)
        .fill(null)
        .map(() => Array(m + 1).fill(Infinity));

      dtw[0][0] = 0;

      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          const cost = Math.abs(seq1[i - 1] - seq2[j - 1]);
          dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
        }
      }

      expect(dtw[n][m]).toBe(0);
    });

    it('应该计算不同序列的DTW距离', () => {
      const seq1 = [0, 1, 2, 3];
      const seq2 = [0, 2, 4, 6];

      const n = seq1.length;
      const m = seq2.length;

      const dtw: number[][] = Array(n + 1)
        .fill(null)
        .map(() => Array(m + 1).fill(Infinity));

      dtw[0][0] = 0;

      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          const cost = Math.abs(seq1[i - 1] - seq2[j - 1]);
          dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
        }
      }

      expect(dtw[n][m]).toBeGreaterThan(0);
    });
  });

  describe('插值', () => {
    it('应该使用线性插值进行重采样', () => {
      const waveform = [0, 10];
      const targetLength = 3;

      const normalized: number[] = [];
      const scaleFactor = (waveform.length - 1) / (targetLength - 1);

      for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * scaleFactor;
        const srcIdxFloor = Math.floor(srcIdx);
        const srcIdxCeil = Math.ceil(srcIdx);
        const frac = srcIdx - srcIdxFloor;

        if (srcIdxFloor === srcIdxCeil) {
          normalized.push(waveform[srcIdxFloor]);
        } else {
          const v1 = waveform[srcIdxFloor];
          const v2 = waveform[srcIdxCeil];
          normalized.push(v1 * (1 - frac) + v2 * frac);
        }
      }

      expect(normalized.length).toBe(3);
      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBeCloseTo(5, 0);
      expect(normalized[2]).toBe(10);
    });
  });

  describe('多通道规范化', () => {
    it('应该规范化多通道波形', () => {
      const waveform = {
        ch1: [0, 1, 2, 3, 4],
        ch2: [0, 2, 4, 6, 8],
        ch3: [0, 3, 6, 9, 12],
      };

      const targetLength = 3;

      // 简单的重采样
      const normalizeChannel = (channel: number[], target: number) => {
        const result: number[] = [];
        const scaleFactor = (channel.length - 1) / (target - 1);

        for (let i = 0; i < target; i++) {
          const srcIdx = i * scaleFactor;
          const srcIdxFloor = Math.floor(srcIdx);
          const srcIdxCeil = Math.ceil(srcIdx);
          const frac = srcIdx - srcIdxFloor;

          if (srcIdxFloor === srcIdxCeil) {
            result.push(channel[srcIdxFloor]);
          } else {
            const v1 = channel[srcIdxFloor];
            const v2 = channel[srcIdxCeil];
            result.push(v1 * (1 - frac) + v2 * frac);
          }
        }

        return result;
      };

      const normalized = {
        ch1: normalizeChannel(waveform.ch1, targetLength),
        ch2: normalizeChannel(waveform.ch2, targetLength),
        ch3: normalizeChannel(waveform.ch3, targetLength),
      };

      expect(normalized.ch1.length).toBe(3);
      expect(normalized.ch2.length).toBe(3);
      expect(normalized.ch3.length).toBe(3);
    });
  });

  describe('推荐目标长度', () => {
    it('应该推荐合理的目标长度', () => {
      const lengths = [500, 510, 505, 515, 495];
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const targetLength = Math.round(avg);

      expect(targetLength).toBeCloseTo(505, 0);
    });

    it('应该处理长度差异大的情况', () => {
      const lengths = [300, 400, 500, 600, 700];
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const targetLength = Math.round(avg);

      expect(targetLength).toBe(500);
    });
  });
});
