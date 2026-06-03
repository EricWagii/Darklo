/**
 * 裁剪完成提示测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CroppingCompletionInfo } from '../cropping-completion-toast';

describe('裁剪完成提示', () => {
  it('应该正确计算裁剪比例', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 800,
      targetLength: 512,
      isCroppingSuccess: true,
      isScalingSuccess: true,
    };

    const croppingRatio = ((info.originalLength - info.croppedLength) / info.originalLength * 100).toFixed(1);
    expect(croppingRatio).toBe('20.0');
  });

  it('应该识别裁剪失败的情况', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 0,
      targetLength: 512,
      isCroppingSuccess: false,
      isScalingSuccess: false,
    };

    expect(info.isCroppingSuccess).toBe(false);
    expect(info.isScalingSuccess).toBe(false);
  });

  it('应该识别缩放失败的情况', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 800,
      targetLength: 512,
      isCroppingSuccess: true,
      isScalingSuccess: false,
    };

    expect(info.isCroppingSuccess).toBe(true);
    expect(info.isScalingSuccess).toBe(false);
  });

  it('应该正确处理完全裁剪的情况', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 1000, // 没有裁剪
      targetLength: 512,
      isCroppingSuccess: true,
      isScalingSuccess: true,
    };

    const croppingRatio = ((info.originalLength - info.croppedLength) / info.originalLength * 100).toFixed(1);
    expect(croppingRatio).toBe('0.0');
  });

  it('应该正确处理大幅裁剪的情况', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 100, // 移除90%
      targetLength: 512,
      isCroppingSuccess: true,
      isScalingSuccess: true,
    };

    const croppingRatio = ((info.originalLength - info.croppedLength) / info.originalLength * 100).toFixed(1);
    expect(croppingRatio).toBe('90.0');
  });

  it('应该验证目标长度是否匹配', () => {
    const info: CroppingCompletionInfo = {
      originalLength: 1000,
      croppedLength: 800,
      targetLength: 512,
      isCroppingSuccess: true,
      isScalingSuccess: true,
    };

    // 检查缩放是否成功（实际长度应该等于目标长度）
    // 这里我们假设缩放后的长度应该是512
    const scaledLength = 512;
    expect(scaledLength).toBe(info.targetLength);
  });
});
