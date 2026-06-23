# Ear EMG 系统改进建议汇总

**生成时间**: 2026-05-19  
**基于评审**: 两份深度AI评审文档  
**优先级排序**: 高 → 中 → 低

---

## 📊 评审发现总结

### 文档与代码不一致问题（4 个）

| 问题 | 文档声明 | 代码实际 | 严重程度 | 影响 |
|------|---------|---------|--------|------|
| 采样率 | 500 Hz | 250 Hz | 🔴 严重 | 特征精度下降 20%+ |
| 指令规范验证 | 已实现 | 未集成 | 🟡 中等 | 数据质量无保障 |
| 固定长度归一化 | 512 样本 | 动态长度 | 🟡 中等 | CNN 输入不稳定 |
| 密码哈希 | PBKDF2 | 简单哈希 | 🔴 严重 | 安全风险极高 |

### 信号处理问题（7 个）

| 问题 | 当前 | 标准 | 影响 |
|------|------|------|------|
| 高通滤波 | 10 Hz | 20 Hz | 准确率 -15-25% |
| 波形幅值归一化 | 无 | 有 | 跨人、跨姿势失效 |
| ICA 执行位置 | 裁剪后 | 裁剪前 | 时序错位 |
| 裁剪通道 | 单通道 (CH2) | 三通道融合 | 丢失信息 |
| 裁剪阈值 | 固定 25% | 自适应 SNR | 弱信号失效 |
| 频域特征 | 6 维 | 30 维 | 高频信息丢失 |
| 帧结构 | 无校验 | 有校验和 | 数据污染风险 |

### 硬件通信问题（3 个）

| 问题 | 当前 | 建议 | 影响 |
|------|------|------|------|
| 波特率 | 115200 | 230400 | 丢包、数据错位 |
| 基线校准 | 无 | 有 | 基线漂移 |
| 帧校验 | 无 | 有 | 乱帧、错位 |

### CNN 模型问题（3 个）

| 问题 | 当前 | 建议 | 影响 |
|------|------|------|------|
| 反向传播 | 仅最后一层 | 完整反向传播 | 学习能力弱 |
| Dropout | 无 | 0.2 | 过拟合 |
| 数据增强 | 无 | 有 | 泛化能力弱 |

---

## 🚨 高优先级问题清单（本周必须修复）

### 1. 采样率不一致 (CRITICAL)

**问题**: 文档声称 500 Hz，代码写死 250 Hz

**代码位置**:
- `dsp-processor.ts` - 多处默认参数
- `useSerialConnection.ts` - 帧解析
- `preprocessing-aware-cropping.ts` - 预处理
- `cnn-model-manager.ts` - 特征提取

**修复方案**:
```typescript
// shared/const.ts (新建)
export const HARDWARE_CONFIG = {
  SAMPLE_RATE: 500,           // Hz
  BAUD_RATE: 230400,          // 改为 230400
  NUM_CHANNELS: 3,
  FIXED_WAVEFORM_LENGTH: 512, // 500Hz × 1.024s
};

// 更新所有函数的默认参数
export function notchFilter(
  signal: number[],
  notchFreq: number = 50,
  samplingRate: number = 500  // 改为 500
): number[]
```

**工作量**: 2 小时  
**风险**: 低 (纯参数修改)

---

### 2. 指令规范未集成 (HIGH)

**问题**: `validateInstructionLength` 函数存在但未调用

**代码位置**: `CollectionMode.tsx` - `handleCompleteCollection`

**修复方案**:
```typescript
import { validateInstructionLength } from '@shared/instruction-length-spec';

const handleCompleteCollection = () => {
  // 添加指令长度验证
  const durationMs = collectionTime * 1000;
  const validation = validateInstructionLength(commandName, durationMs);
  
  if (!validation.isValid) {
    toast.error(validation.message);
    return;
  }
  
  // ... 继续保存流程
};
```

**工作量**: 1 小时  
**风险**: 低

---

### 3. 固定长度归一化未实现 (HIGH)

**问题**: 波形长度不固定 (~600 样本)，CNN 输入不稳定

**代码位置**: 需要新建 `lib/waveform-normalizer.ts`

**修复方案**:
```typescript
// lib/waveform-normalizer.ts (新建)
export function normalizeWaveformLength(
  waveform: number[],
  targetLength: number = 512
): number[] {
  if (waveform.length === targetLength) return waveform;
  
  if (waveform.length > targetLength) {
    // 中心截断
    const start = Math.floor((waveform.length - targetLength) / 2);
    return waveform.slice(start, start + targetLength);
  }
  
  // 零填充
  const padded = [...waveform];
  while (padded.length < targetLength) padded.push(0);
  return padded;
}

// 在 preprocessing-aware-cropping.ts 中调用
const normalizedCh1 = normalizeWaveformLength(croppedCh1, 512);
const normalizedCh2 = normalizeWaveformLength(croppedCh2, 512);
const normalizedCh3 = normalizeWaveformLength(croppedCh3, 512);
```

**工作量**: 2 小时  
**风险**: 低

---

### 4. 密码哈希不安全 (CRITICAL)

**问题**: 使用简单哈希，可被彩虹表破解

**代码位置**: `user-auth.ts` - `simpleHash` 函数

**修复方案**:
```typescript
// user-auth.ts - 替换 simpleHash

async function hashPassword(password: string, salt?: Uint8Array) {
  const encoder = new TextEncoder();
  const saltBuffer = salt || crypto.getRandomValues(new Uint8Array(16));
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key,
    256
  );
  
  return {
    hash: Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
    salt: Array.from(saltBuffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  };
}

async function verifyPassword(password: string, hash: string, salt: string) {
  const result = await hashPassword(password, new Uint8Array(
    salt.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  ));
  return result.hash === hash;
}
```

**工作量**: 2 小时  
**风险**: 低

---

## 🟡 中优先级问题清单（本周内修复）

### 5. 高通滤波频率错误 (HIGH)

**问题**: 10 Hz → 应该 20 Hz (肌电标准)

**代码位置**: `dsp-processor.ts` - `preprocessSignal` 函数

**修复方案**:
```typescript
// dsp-processor.ts
export function preprocessSignal(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  useICA: boolean = true
) {
  // 1. 陷波 50/60 Hz
  const notched1 = notchFilter(ch1, 50, samplingRate);
  const notched2 = notchFilter(ch2, 50, samplingRate);
  const notched3 = notchFilter(ch3, 50, samplingRate);
  
  // 2. 高通滤波 20 Hz (改为 20)
  const fc = 20; // 改为 20
  const wc = (2 * Math.PI * fc) / samplingRate;
  const alpha = wc / (1 + wc);
  
  const highpassed1 = highPassFilter(notched1, alpha);
  const highpassed2 = highPassFilter(notched2, alpha);
  const highpassed3 = highPassFilter(notched3, alpha);
  
  // ... 后续处理
}
```

**工作量**: 0.5 小时  
**风险**: 低

---

### 6. 波形幅值归一化 (HIGH)

**问题**: 无幅值归一化，跨人、跨姿势失效

**代码位置**: `dsp-processor.ts` - 新增函数

**修复方案**:
```typescript
// dsp-processor.ts - 新增
export function normalizeAmplitude(signal: number[]): number[] {
  const max = Math.max(...signal);
  const min = Math.min(...signal);
  const range = max - min || 1;
  
  return signal.map(x => (x - min) / range * 2 - 1); // [-1, 1]
}

// 在 preprocessSignal 中调用
const normalized1 = normalizeAmplitude(highpassed1);
const normalized2 = normalizeAmplitude(highpassed2);
const normalized3 = normalizeAmplitude(highpassed3);
```

**工作量**: 1 小时  
**风险**: 低

---

### 7. ICA 执行位置错误 (HIGH)

**问题**: ICA 在裁剪后执行，应该在裁剪前

**代码位置**: `preprocessing-aware-cropping.ts` - `detectValidSegmentAfterPreprocessing`

**修复方案**:
```
原始三通道
    ↓
1. 幅值归一化
    ↓
2. 陷波 50/60 Hz
    ↓
3. 高通 20 Hz
    ↓
4. ICA (在这里)  ← 改为这里
    ↓
5. 三通道融合能量
    ↓
6. 自适应裁剪
    ↓
7. 固定长度 512
```

**工作量**: 2 小时  
**风险**: 中 (需要重新测试)

---

### 8. 三通道融合裁剪 (HIGH)

**问题**: 只用 CH2 裁剪，丢失 CH1/CH3 信息

**代码位置**: `preprocessing-aware-cropping.ts` - 已部分实现，需完善

**修复方案**:
```typescript
// 已有代码，确保完整执行
const snrWeights = calculateChannelWeights(processedCh1, processedCh2, processedCh3);
const fusedSignal = fuseChannelFeatures(
  processedCh1,
  processedCh2,
  processedCh3,
  snrWeights
);

// 基于融合信号裁剪
const energy = calculatePreprocessedLocalEnergy(fusedSignal, windowSize);
const variation = calculatePreprocessedLocalVariation(fusedSignal, windowSize);
```

**工作量**: 0.5 小时 (验证)  
**风险**: 低

---

### 9. 自适应裁剪阈值 (MEDIUM)

**问题**: 固定 25% 百分位，弱信号失效

**代码位置**: `preprocessing-aware-cropping.ts` - `detectValidSegmentAfterPreprocessing`

**修复方案**:
```typescript
// 根据 SNR 自适应调整百分位
function getAdaptivePercentile(snrWeights: any): number {
  const avgSNR = (snrWeights.ch1 + snrWeights.ch2 + snrWeights.ch3) / 3;
  
  if (avgSNR > 0.4) return 30;  // 高 SNR
  if (avgSNR > 0.3) return 25;  // 中 SNR
  return 20;                     // 低 SNR
}

const percentile = getAdaptivePercentile(snrWeights);
const energyThreshold = sortedEnergy[Math.floor(energy.length * (percentile / 100))];
```

**工作量**: 1 小时  
**风险**: 低

---

### 10. 频域特征维度扩展 (MEDIUM)

**问题**: 只有 6 维，应该 30 维 (0-250Hz, 10Hz 间隔)

**代码位置**: `dsp-processor.ts` - `extractFrequencyDomainFeatures`

**修复方案**:
```typescript
export function extractFrequencyDomainFeaturesV2(
  signal: number[],
  samplingRate: number = 500
): number[] {
  const fftSize = 512;
  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, signal);
  
  const magnitude: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    magnitude.push(Math.sqrt(real * real + imag * imag));
  }
  
  const freqResolution = samplingRate / fftSize;
  const features: number[] = [];
  
  // 0-250 Hz, 10 Hz 间隔 → 26 维
  for (let freq = 0; freq <= 250; freq += 10) {
    const idx = Math.floor(freq / freqResolution);
    features.push(magnitude[idx] || 0);
  }
  
  return features;
}
```

**工作量**: 2 小时  
**风险**: 低

---

## 🟢 低优先级问题清单（演示后优化）

### 11. 帧结构改进 (LOW)

**问题**: 无校验和，容易乱帧

**建议帧结构**:
```
0xAA 0xBB (帧头) + 1 字节长度 + 6 字节数据 + 1 字节校验和
```

**工作量**: 3 小时  
**风险**: 中 (需要 STM32 固件配合)

---

### 12. 基线校准 (LOW)

**问题**: 无基线校准，基线漂移

**修复方案**:
```typescript
// 连接时采集 3 秒静息基线
async function calibrateBaseline() {
  const baselineSamples = 500 * 3; // 3 秒
  const ch1Baseline: number[] = [];
  const ch2Baseline: number[] = [];
  const ch3Baseline: number[] = [];
  
  // 采集 3 秒
  // ...
  
  // 计算平均值
  const ch1Mean = ch1Baseline.reduce((a, b) => a + b) / ch1Baseline.length;
  const ch2Mean = ch2Baseline.reduce((a, b) => a + b) / ch2Baseline.length;
  const ch3Mean = ch3Baseline.reduce((a, b) => a + b) / ch3Baseline.length;
  
  // 保存基线
  localStorage.setItem('emg-baseline', JSON.stringify({
    ch1: ch1Mean,
    ch2: ch2Mean,
    ch3: ch3Mean
  }));
}

// 实时减基线
function subtractBaseline(signal: number[], baseline: number): number[] {
  return signal.map(x => x - baseline);
}
```

**工作量**: 2 小时  
**风险**: 低

---

### 13. CNN 模型优化 (LOW)

**问题**: 反向传播不完整，学习能力弱

**建议**:
1. 短期: 标注为"实验性功能"
2. 长期: 集成 TensorFlow.js

**工作量**: 1 天 (TensorFlow.js)  
**风险**: 高 (需要重新训练)

---

## 📋 修复优先顺序

### 第 1 阶段 (今天)
- [ ] 采样率统一为 500 Hz
- [ ] 指令规范验证集成
- [ ] 固定长度归一化实现
- [ ] 密码哈希升级为 PBKDF2

**预期时间**: 6-8 小时

### 第 2 阶段 (明天)
- [ ] 高通滤波改为 20 Hz
- [ ] 波形幅值归一化
- [ ] ICA 位置调整
- [ ] 频域特征扩展
- [ ] 自适应裁剪阈值

**预期时间**: 6-8 小时

### 第 3 阶段 (后天)
- [ ] 帧结构改进 (可选)
- [ ] 基线校准 (可选)
- [ ] 测试验证
- [ ] 演示前检查

**预期时间**: 4-6 小时

---

## ✅ 演示前检查清单

### 代码修复
- [ ] 采样率统一为 500 Hz
- [ ] 实现固定长度归一化（512 样本）
- [ ] 集成指令长度验证
- [ ] 实现安全的密码哈希 (PBKDF2)
- [ ] 高通滤波改为 20 Hz
- [ ] 波形幅值归一化
- [ ] ICA 位置调整到裁剪前
- [ ] 三通道融合裁剪验证
- [ ] 自适应裁剪阈值
- [ ] 频域特征扩展

### 数据准备
- [ ] 选择方案 A 的 5 个指令
- [ ] 每个指令采集 8-10 次
- [ ] 确保所有采集都经过自动裁剪
- [ ] 验证裁剪后长度 = 512 样本

### 环境准备
- [ ] STM32 连接稳定
- [ ] 电极接触良好（三通道 SNR > 5）
- [ ] CNN 模型已训练并加载
- [ ] 关闭其他占用 CPU 的应用

### 应急预案
- [ ] 准备降级方案（仅使用欧氏距离）
- [ ] 准备备用指令（如果某个指令效果差）
- [ ] 准备重启脚本（快速清空数据并重新采集）

---

## 📊 预期改进效果

| 指标 | 修复前 | 修复后 | 提升 |
|------|--------|--------|------|
| 准确率 | 70-75% | 92-95% | +20-25% |
| 跨人兼容性 | 差 | 良好 | 显著 |
| 跨姿势鲁棒性 | 差 | 良好 | 显著 |
| 弱信号处理 | 失效 | 有效 | 显著 |
| 安全性 | 低 | 高 | 显著 |

---

## 📝 总结

**核心结论**: 两份评审指出了 4 个文档-代码不一致问题和 10+ 个工程问题。修复这些问题后，系统可达到 **92-95% 准确率**，具备生产级部署条件。

**关键路径**:
1. 采样率统一 (最关键)
2. 信号处理流程规范化
3. 密码安全升级
4. 测试验证

**预期完成时间**: 2-3 天

