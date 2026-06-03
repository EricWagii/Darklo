/**
 * 裁剪和缩放完成提示工具
 * 在采集和测试阶段显示裁剪和缩放是否完成
 */

import { toast } from 'sonner';

export interface CroppingCompletionInfo {
  originalLength: number;
  croppedLength: number;
  targetLength: number;
  isCroppingSuccess: boolean;
  isScalingSuccess: boolean;
}

/**
 * 显示裁剪完成提示
 */
export function showCroppingCompletionToast(info: CroppingCompletionInfo): void {
  const { originalLength, croppedLength, targetLength, isCroppingSuccess, isScalingSuccess } = info;

  if (!isCroppingSuccess) {
    toast.error('❌ 裁剪失败：无法找到有效信号');
    return;
  }

  if (!isScalingSuccess) {
    toast.error('❌ 缩放失败：无法将波形缩放到固定长度');
    return;
  }

  // 裁剪和缩放都成功
  const croppingRatio = ((originalLength - croppedLength) / originalLength * 100).toFixed(1);
  const message = `✅ 裁剪成功 | 原始: ${originalLength}ms → 裁剪: ${croppedLength}ms (移除${croppingRatio}%) → 缩放: ${targetLength}ms`;
  
  toast.success(message, {
    duration: 3000,
  });
}

/**
 * 显示采集阶段的裁剪提示
 */
export function showCollectionCroppingToast(info: CroppingCompletionInfo): void {
  showCroppingCompletionToast(info);
}

/**
 * 显示测试阶段的裁剪提示
 */
export function showRecognitionCroppingToast(info: CroppingCompletionInfo): void {
  showCroppingCompletionToast(info);
}
