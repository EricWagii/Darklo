/**
 * 指令长度规范定义
 * 
 * 所有指令的发音时长必须在规定范围内，以确保：
 * 1. 固定长度裁剪（512 样本 @ 500Hz = 1.024 秒）的有效性
 * 2. 模型训练的一致性和准确率
 * 3. 避免过长指令被截断或过短指令被过度填充
 */

/**
 * 指令长度规范
 */
export interface InstructionLengthSpec {
  // 指令名称
  name: string;
  
  // 最小发音时长（毫秒）
  minDurationMs: number;
  
  // 最大发音时长（毫秒）
  maxDurationMs: number;
  
  // 推荐发音时长（毫秒）
  recommendedDurationMs: number;
  
  // 说明
  description: string;
}

/**
 * 指令长度规范库
 * 
 * 规范原则：
 * - 最大时长 < 1.024 秒（512 样本 @ 500Hz）
 * - 最小时长 > 0.1 秒（50 样本 @ 500Hz）
 * - 推荐时长在中间值
 */
export const INSTRUCTION_LENGTH_SPECS: Record<string, InstructionLengthSpec> = {
  // 单音节指令
  "是": {
    name: "是",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节肯定回答，发音简短清晰",
  },
  "否": {
    name: "否",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节否定回答，发音简短清晰",
  },
  "开": {
    name: "开",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节开启指令，发音简短清晰",
  },
  "关": {
    name: "关",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节关闭指令，发音简短清晰",
  },

  // 双音节指令
  "播放": {
    name: "播放",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节播放指令，发音清晰",
  },
  "暂停": {
    name: "暂停",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节暂停指令，发音清晰",
  },
  "音量": {
    name: "音量",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节音量指令，发音清晰",
  },
  "亮度": {
    name: "亮度",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节亮度指令，发音清晰",
  },

  // 三音节指令
  "上一曲": {
    name: "上一曲",
    minDurationMs: 300,
    maxDurationMs: 600,
    recommendedDurationMs: 450,
    description: "三音节上一曲指令，注意不要过长",
  },
  "下一曲": {
    name: "下一曲",
    minDurationMs: 300,
    maxDurationMs: 600,
    recommendedDurationMs: 450,
    description: "三音节下一曲指令，注意不要过长",
  },
  "快进": {
    name: "快进",
    minDurationMs: 200,
    maxDurationMs: 450,
    recommendedDurationMs: 320,
    description: "双音节快进指令，发音清晰",
  },
  "快退": {
    name: "快退",
    minDurationMs: 200,
    maxDurationMs: 450,
    recommendedDurationMs: 320,
    description: "双音节快退指令，发音清晰",
  },
  "音量加": {
    name: "音量加",
    minDurationMs: 250,
    maxDurationMs: 500,
    recommendedDurationMs: 380,
    description: "三音节音量加指令，注意不要过长",
  },
  "音量减": {
    name: "音量减",
    minDurationMs: 250,
    maxDurationMs: 500,
    recommendedDurationMs: 380,
    description: "三音节音量减指令，注意不要过长",
  },
};

/**
 * 采样率常量
 */
export const SAMPLE_RATE = 500; // Hz

/**
 * 固定长度常量
 */
export const FIXED_WAVEFORM_LENGTH = 512; // 样本

/**
 * 计算固定长度对应的时间长度
 */
export const FIXED_DURATION_MS = (FIXED_WAVEFORM_LENGTH / SAMPLE_RATE) * 1000; // 1.024 秒

/**
 * 验证指令长度是否符合规范
 * @param instructionName 指令名称
 * @param durationMs 实际发音时长（毫秒）
 * @returns 验证结果
 */
export function validateInstructionLength(
  instructionName: string,
  durationMs: number
): {
  isValid: boolean;
  message: string;
  spec?: InstructionLengthSpec;
} {
  // 使用 getInstructionSpec 获取规范（支持自动生成）
  const spec = getInstructionSpec(instructionName);

  if (!spec) {
    return {
      isValid: false,
      message: `无法为指令 "${instructionName}" 生成规范`,
    };
  }

  if (durationMs < spec.minDurationMs) {
    return {
      isValid: false,
      message: `指令 "${instructionName}" 过短（${durationMs}ms < ${spec.minDurationMs}ms），请重新发音`,
      spec,
    };
  }

  if (durationMs > spec.maxDurationMs) {
    return {
      isValid: false,
      message: `指令 "${instructionName}" 过长（${durationMs}ms > ${spec.maxDurationMs}ms），请重新发音`,
      spec,
    };
  }

  return {
    isValid: true,
    message: `指令 "${instructionName}" 长度符合规范（${durationMs}ms）`,
    spec,
  };
}

/**
 * 计算波形对应的发音时长
 * @param waveformLength 波形样本数
 * @returns 发音时长（毫秒）
 */
export function calculateDurationMs(waveformLength: number): number {
  return (waveformLength / SAMPLE_RATE) * 1000;
}

/**
 * 计算发音时长对应的样本数
 * @param durationMs 发音时长（毫秒）
 * @returns 样本数
 */
export function calculateSampleCount(durationMs: number): number {
  return Math.round((durationMs / 1000) * SAMPLE_RATE);
}

/**
 * 根据指令名称长度推断指令类型
 */
function inferInstructionType(instructionName: string): 'single-syllable' | 'double-syllable' | 'multi-syllable' {
  const charCount = instructionName.length;
  if (charCount <= 2) return 'single-syllable';
  if (charCount <= 4) return 'double-syllable';
  return 'multi-syllable';
}

/**
 * 为缺失规范的指令生成默认规范
 */
function generateDefaultSpec(instructionName: string): InstructionLengthSpec {
  const type = inferInstructionType(instructionName);
  
  const defaultSpecs: Record<string, Omit<InstructionLengthSpec, 'name'>> = {
    'single-syllable': {
      minDurationMs: 150,
      maxDurationMs: 300,
      recommendedDurationMs: 200,
      description: '单音节指令（自动生成规范）',
    },
    'double-syllable': {
      minDurationMs: 200,
      maxDurationMs: 450,
      recommendedDurationMs: 320,
      description: '双音节指令（自动生成规范）',
    },
    'multi-syllable': {
      minDurationMs: 250,
      maxDurationMs: 600,
      recommendedDurationMs: 400,
      description: '多音节指令（自动生成规范）',
    },
  };
  
  const spec = defaultSpecs[type];
  return {
    name: instructionName,
    ...spec,
  };
}

/**
 * 获取指令的规范（支持自动生成缺失规范）
 * @param instructionName 指令名称
 * @returns 规范信息
 */
export function getInstructionSpec(instructionName: string): InstructionLengthSpec | null {
  // 先查找定义的规范
  if (INSTRUCTION_LENGTH_SPECS[instructionName]) {
    return INSTRUCTION_LENGTH_SPECS[instructionName];
  }
  
  // 如果未定义，自动生成默认规范
  return generateDefaultSpec(instructionName);
}

/**
 * 获取所有指令的规范
 * @returns 所有规范信息
 */
export function getAllInstructionSpecs(): InstructionLengthSpec[] {
  return Object.values(INSTRUCTION_LENGTH_SPECS);
}

/**
 * 生成指令长度规范的人类可读文本
 * @returns 规范文本
 */
export function generateSpecText(): string {
  const specs = getAllInstructionSpecs();
  const lines: string[] = [
    "=" .repeat(70),
    "指令长度规范",
    "=" .repeat(70),
    "",
    `固定长度：${FIXED_WAVEFORM_LENGTH} 样本 @ ${SAMPLE_RATE}Hz = ${FIXED_DURATION_MS.toFixed(3)} 秒`,
    "",
    "指令规范：",
    "-" .repeat(70),
  ];

  specs.forEach((spec) => {
    lines.push(
      `${spec.name.padEnd(10)} | ${spec.minDurationMs}ms - ${spec.maxDurationMs}ms | 推荐: ${spec.recommendedDurationMs}ms`
    );
  });

  lines.push("-" .repeat(70));
  lines.push("");
  lines.push("注意事项：");
  lines.push("1. 所有指令的发音时长必须在规定范围内");
  lines.push("2. 过短的指令会被过度填充，影响特征质量");
  lines.push("3. 过长的指令会被中间截断，丢失信息");
  lines.push("4. 推荐使用推荐时长进行发音");
  lines.push("");

  return lines.join("\n");
}
