/**
 * 测试模式集成层 - 使用新的独立裁剪算法
 * 
 * 为 RecognitionMode 提供统一的波形处理接口
 */

import { cropIndependently } from './independent-cropping';

export interface RecognitionWaveformResult {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  meta: {
    croppingMeta: {
      stage: 'primary' | 'fallback';
      confidence: number;
      startIdx: number;
      endIdx: number;
      croppedLength: number;
    };
  };
}

/**
 * 处理测试波形 - 使用新的独立裁剪算法
 * 
 * @param waveform 原始波形
 * @param targetLength 目标长度（默认512）
 * @returns 处理后的波形（包含元数据）
 */
export function processRecognitionWaveform(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] }
): RecognitionWaveformResult {
  // 第一步：独立裁剪（每个通道独立处理）
  const croppingResult = cropIndependently(waveform.ch1, waveform.ch2, waveform.ch3);

  // 第二步：提取裁剪后的波形（只进行空白裁剪，不进行缩放）
  const croppedWaveform = {
    ch1: waveform.ch1.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch2: waveform.ch2.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch3: waveform.ch3.slice(croppingResult.startIdx, croppingResult.endIdx)
  };

  // 第三步：返回带元数据的结果
  return {
    ch1: croppedWaveform.ch1,
    ch2: croppedWaveform.ch2,
    ch3: croppedWaveform.ch3,
    meta: {
      croppingMeta: {
        stage: (croppingResult.stage === 'final-fallback' ? 'fallback' : croppingResult.stage) as 'primary' | 'fallback',
        confidence: croppingResult.confidence,
        startIdx: croppingResult.startIdx,
        endIdx: croppingResult.endIdx,
        croppedLength: croppingResult.endIdx - croppingResult.startIdx
      }
    }
  };
}

/**
 * 批量处理测试波形
 */
/**
 * 批量处理测试波形
 */
export function batchProcessRecognitionWaveforms(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): RecognitionWaveformResult[] {
  return waveforms.map(wf => processRecognitionWaveform(wf));
}

/**
 * 获取测试波形的处理状态描述
 */
export function getRecognitionCroppingStatus(result: RecognitionWaveformResult): string {
  const { croppingMeta } = result.meta;
  const croppedLength = croppingMeta.croppedLength;

  const stage = croppingMeta.stage === 'primary' ? '✅ 主算法' : '⚠️ 降级算法';
  const confidence = (croppingMeta.confidence * 100).toFixed(0);

  return `${stage} | 裁剪长度: ${croppedLength} | 置信度: ${confidence}%`;
}

/**
 * 检查测试波形的质量
 */
export function isRecognitionWaveformQualityAcceptable(result: RecognitionWaveformResult): boolean {
  // 测试模式下，只要处理成功就认为质量可接受
  // 即使使用了降级算法，也返回 true
  return true;
}

/**
 * 获取测试波形的质量评分（0-100）
 */
export function getRecognitionWaveformQualityScore(result: RecognitionWaveformResult): number {
  const { croppingMeta } = result.meta;
  
  // 基于置信度计算质量评分
  // 主算法：confidence * 100
  // 降级算法：confidence * 50（因为是降级）
  const baseScore = croppingMeta.confidence * 100;
  const multiplier = croppingMeta.stage === 'primary' ? 1 : 0.5;
  
  return Math.min(100, Math.max(0, baseScore * multiplier));
}
