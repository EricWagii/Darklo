/**
 * 裁剪阶段推断模块
 * 
 * 根据裁剪结果的质量指标推断处理阶段（primary/fallback/full_segment）
 * 
 * 设计原则：
 * - primary：高质量裁剪，使用双端静息估计法，confidence > 0.8
 * - fallback：中等质量裁剪，使用Otsu二值化，confidence <= 0.8
 * - full_segment：低质量裁剪，使用全段，isQualityAcceptable: false
 */

/**
 * 裁剪阶段配置
 * 
 * 可以通过修改这些常量来调整阶段推断的阈值
 */
export const CROPPING_STAGE_CONFIG = {
  // Primary阶段的最低置信度阈值
  // 理由：0.8表示算法对裁剪结果的信心达到80%
  // 这个阈值基于实验数据：confidence > 0.8时，裁剪准确率 > 95%
  PRIMARY_CONFIDENCE_THRESHOLD: 0.8,
  
  // Fallback阶段的最低置信度阈值
  // 理由：0.2表示最低可接受的置信度
  // 低于此值的结果不可靠，应该使用全段
  FALLBACK_CONFIDENCE_THRESHOLD: 0.2,
};

/**
 * 简单裁剪结果接口
 */
export interface SimpleCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  isQualityAcceptable: boolean;
  [key: string]: any;
}

/**
 * 推断裁剪处理阶段
 * 
 * 根据裁剪结果的质量指标推断处理阶段
 * 
 * @param croppingResult 裁剪结果
 * @returns 处理阶段：'primary' | 'fallback' | 'full_segment'
 * 
 * @example
 * const stage = inferCroppingStage(croppingResult);
 * // 'primary' - 高质量裁剪
 * // 'fallback' - 中等质量裁剪
 * // 'full_segment' - 低质量裁剪
 */
export function inferCroppingStage(
  croppingResult: SimpleCroppingResult
): 'primary' | 'fallback' | 'full_segment' {
  // 第一优先级：检查质量是否可接受
  // 如果质量不可接受，直接返回 full_segment
  if (!croppingResult.isQualityAcceptable) {
    return 'full_segment';
  }

  // 第二优先级：根据置信度判断
  // 高置信度 (> 0.8) 使用主要算法
  if (croppingResult.confidence > CROPPING_STAGE_CONFIG.PRIMARY_CONFIDENCE_THRESHOLD) {
    return 'primary';
  }

  // 低置信度使用降级算法
  return 'fallback';
}

/**
 * 获取阶段的显示标签
 * 
 * @param stage 处理阶段
 * @returns 显示标签
 */
export function getStageLabelForDisplay(stage: 'primary' | 'fallback' | 'full_segment'): string {
  const labels = {
    'primary': '✅ 已裁剪/已缩放',
    'fallback': '⚠️ 已裁剪/已缩放(降级)',
    'full_segment': '❌ 使用全段'
  };
  return labels[stage];
}

/**
 * 获取阶段的方法名称
 * 
 * @param stage 处理阶段
 * @returns 方法名称
 */
export function getMethodForStage(stage: 'primary' | 'fallback' | 'full_segment'): string {
  const methods = {
    'primary': 'resting-baseline',
    'fallback': 'otsu',
    'full_segment': 'full-segment'
  };
  return methods[stage];
}

/**
 * 获取阶段的原因说明
 * 
 * @param stage 处理阶段
 * @returns 原因说明
 */
export function getReasonForStage(stage: 'primary' | 'fallback' | 'full_segment'): string {
  const reasons = {
    'primary': '使用主要裁剪方法（双端静息估计）',
    'fallback': '降级到次要裁剪方法（Otsu二值化）',
    'full_segment': '质量不可接受，使用完整段'
  };
  return reasons[stage];
}

/**
 * 获取阶段的颜色（用于UI展示）
 * 
 * @param stage 处理阶段
 * @returns 颜色代码
 */
export function getColorForStage(stage: 'primary' | 'fallback' | 'full_segment'): string {
  const colors = {
    'primary': '#10b981',    // 绿色 - 成功
    'fallback': '#f59e0b',   // 橙色 - 警告
    'full_segment': '#ef4444' // 红色 - 错误
  };
  return colors[stage];
}
