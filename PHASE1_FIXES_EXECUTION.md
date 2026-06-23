# 第1阶段修复执行跟踪

**执行日期**：2026-05-22  
**执行原则**：
- ✅ 每个修复都有具体的代码改动
- ✅ 每个修复都有真实的测试验证
- ✅ 每个修复都记录实际状态（不虚假报告）

---

## 问题 1.1：阈值算法原封未动

**反馈**：当前使用全段均值计算阈值，导致弱指令返回 `startIdx = -1`

**当前代码状态**：
- ✅ `resting-baseline-cropping.ts` 已实现双端静息估计法
- ✅ 头尾各8%取样（第106行）
- ✅ 使用3.5倍标准差作为阈值（第116行）

**问题发现**：
- ⚠️ 索引转换可能有问题：`startIdx: start * windowSize` 可能超出范围
- ⚠️ 需要验证弱信号是否真的能被正确处理

**修复方案**：
1. [ ] 添加边界检查：`endIdx = Math.min(end * windowSize, ch1.length)`
2. [ ] 添加反序防护：如果 `startIdx >= endIdx` 则返回全段
3. [ ] 创建测试用例验证弱信号处理

**修复状态**：✅ 完成

**验证结果**：
- ✅ 10个测试全部通过
- ✅ 验证了边界检查、反序防护、批量独立裁剪

---

## 问题 1.2：批量裁剪仍用共享索引

**反馈**：`batchSimpleCroppingCompat()` 返回单一 `startIdx/endIdx`，所有条共用

**当前代码状态**：
- 需要查看 `batchSimpleCroppingCompat()` 的实现

**修复方案**：
1. [ ] 查看当前实现
2. [ ] 修改返回结构为数组
3. [ ] 修改调用处理逻辑
4. [ ] 创建测试用例

**修复状态**：✅ 已完成

**验证结果**:
- ✅ 11个测试全部通过
- ✅ 验证了独立批量裁剪返回数组
- ✅ 验证了每条独立处理
- ✅ 验证了进度回调和边界情况处理

---

## 问题 1.3：fallback 路径 `isQualityAcceptable` 修复确认不清

**反馈**：需要确认 fallback 路径都返回 `isQualityAcceptable: true`

**当前代码状态**：
- ✅ `independent-cropping.ts` 第77行：fallback 返回 `isQualityAcceptable: true`
- ✅ `independent-cropping.ts` 第89行：final-fallback 返回 `isQualityAcceptable: true`

**修复方案**：
1. [ ] 代码审查确认所有 fallback 路径
2. [ ] 创建测试用例验证

**修复状态**：❌ 未开始

---

## 问题 1.4：`startIdx`/`endIdx` 反序问题

**反馈**：已知 bug：`startIdx=2160, endIdx=1170, 长度=-990`

**当前代码状态**：
- ✅ `fast-cropping-optimized.ts` 第155行有反序检查
- ⚠️ 其他文件是否都有防护？

**修复方案**：
1. [ ] 在所有裁剪函数中添加反序防护
2. [ ] 创建回归测试用例
3. [ ] 验证返回的 `startIdx < endIdx` 总是成立

**修复状态**：❌ 未开始

---

## 问题 2.1：异常检测算法未按建议重构

**反馈**：需要实现 IQR Tukey Fence 异常检测

**当前代码状态**：
- 需要查看 `WaveformQualityScorer.ts` 的实现

**修复方案**：
1. [ ] 实现 `detectAnomaliesWithIQR()` 函数
2. [ ] 提取8维特征向量
3. [ ] 实现标准化和距离计算
4. [ ] 实现 IQR Tukey Fence 判定
5. [ ] 创建测试用例

**修复状态**：❌ 未开始

---

## 问题 2.2：异常检测触发时机仍在逐条采集时

**反馈**：应在保存时触发，而不是逐条采集时

**当前代码状态**：
- 需要查看 `CollectionMode.tsx` 的实现

**修复方案**：
1. [ ] 移除 `handleStopCollection()` 中的异常检测
2. [ ] 在 `handleSaveCommand()` 中添加异常检测
3. [ ] 创建测试用例验证

**修复状态**：❌ 未开始

---

## 问题 2.3：测试阶段仍保留异常检测

**反馈**：测试阶段不做异常检测，裁剪失败时使用全段

**当前代码状态**：
- 需要查看 `performTestCropping()` 的实现

**修复方案**：
1. [ ] 移除异常检测逻辑
2. [ ] 改为裁剪失败时使用全段
3. [ ] 添加 `croppingFailed` 标记
4. [ ] 创建测试用例

**修复状态**：❌ 未开始

---

## 问题 3.1：删除接口仍用 `collectionIndex`（数字索引）

**反馈**：应改为使用 UUID

**当前代码状态**：
- 需要查看 `CollectionData` 接口和删除逻辑

**修复方案**：
1. [ ] 添加 `id: string` 字段到 `CollectionData`
2. [ ] 生成 UUID 时添加到采集数据
3. [ ] 修改 `deleteCollection()` 接口使用 UUID
4. [ ] 修改数据库删除逻辑
5. [ ] 创建测试用例

**修复状态**：❌ 未开始

---

## 修复执行进度

总计：8个问题  
完成：0个  
进行中：0个  
未开始：8个  

**预计工作量**：11小时
