# 关键源代码文件汇总

**生成时间**: 2026-05-19  
**项目版本**: f2946b54  

本文档包含项目中最关键的源代码文件（共 150 个文件，29,168 行代码）。

---

## 📌 文件导航

### 核心库 (lib/ - 38 个文件)
- DSP 信号处理: dsp-processor.ts, frequency-domain-features-v2.ts
- 波形处理: preprocessing-aware-cropping.ts, auto-segmentation.ts
- 模型: cnn-model.ts, cnn-model-manager.ts, recognition-engine.ts
- 数据存储: data-storage-service.ts, db.ts
- 工具: logger.ts, audit-log.ts, user-auth.ts

### 页面 (pages/ - 12 个文件)
- CollectionMode.tsx (采集训练)
- RecognitionMode.tsx (识别测试)
- DataManagement.tsx (数据管理)
- AdminDashboard.tsx (管理后台)
- 其他页面...

### 组件 (components/ - 45+ 个文件)
- UI 基础组件 (ui/ - 30+ 个)
- 业务组件 (10+ 个)
- 认证组件 (2 个)

### 钩子 (hooks/ - 12 个文件)
- useSerialConnection.ts
- useEMGCollection.ts
- useEMGRecognition.ts
- 其他钩子...

### 上下文 (contexts/ - 5 个文件)
- AuthContext.tsx
- SerialConnectionContext.tsx
- UserContext.tsx
- 其他上下文...

---

## 📥 完整源代码下载

所有源代码文件已打包为 ZIP 文件：

**文件**: ear-emg-complete-source.zip (273 KB)
**包含**: client/src 目录下的所有 150 个源代码文件
**格式**: TypeScript / TSX

---

## 🔍 关键文件详情

### 1. dsp-processor.ts (1,200+ 行)
**功能**: 核心 DSP 信号处理
**关键函数**:
- notchFilter() - 陷波滤波
- highPassFilter() - 高通滤波
- preprocessSignal() - 完整预处理
- extractFullFeatures() - 180 维特征提取
- extractTimeDomainFeatures() - 时域特征
- normalizeFeatures() - 特征归一化

### 2. preprocessing-aware-cropping.ts (350+ 行)
**功能**: 预处理感知裁剪
**关键函数**:
- detectValidSegmentAfterPreprocessing() - 检测有效片段
- alignMultipleCollectionsAfterPreprocessing() - 多采集对齐
- calculateSNRWeights() - 计算 SNR 权重

### 3. cnn-model.ts (300+ 行)
**功能**: 1D CNN 模型实现
**关键类**:
- Conv1DLayer - 卷积层
- DenseLayer - 全连接层
- CNNModel - 完整模型

### 4. recognition-engine.ts (300+ 行)
**功能**: 识别引擎
**关键函数**:
- recognize() - 完整识别流程
- preprocessAndRecognize() - 预处理和识别
- getTopMatches() - 获取最佳匹配

### 5. CollectionMode.tsx (1,200+ 行)
**功能**: 采集训练页面
**关键功能**:
- 指令输入和管理
- 实时波形采集
- 自动裁剪
- 特征库生成
- 质量评分

### 6. RecognitionMode.tsx (800+ 行)
**功能**: 识别测试页面
**关键功能**:
- 实时识别
- 结果显示
- 用户反馈
- 性能统计

### 7. data-storage-service.ts (300+ 行)
**功能**: IndexedDB 数据存储
**关键函数**:
- saveCommand() - 保存指令
- loadCommand() - 加载指令
- cacheFeatures() - 缓存特征
- exportData() - 导出数据

### 8. multi-channel-fusion.ts (200+ 行)
**功能**: 三通道 EMG 融合
**关键函数**:
- calculateChannelWeights() - 计算权重
- fuseChannelFeatures() - 融合特征
- computeSNR() - 计算 SNR

---

## 📊 代码统计

| 模块 | 文件数 | 代码行数 |
|------|--------|----------|
| lib/ | 38 | 10,737 |
| components/ | 45+ | 10,587 |
| pages/ | 12 | 5,792 |
| hooks/ | 12 | 1,409 |
| contexts/ | 5 | 498 |
| 其他 | 5 | 145 |
| **总计** | **117** | **29,168** |

---

## 🔗 相关文档

- ARCHITECTURE_AND_MODULES.md - 完整架构说明
- COMPLETE_CODE_INVENTORY.md - 代码清单
- CODE_REVIEW_FIXES_REPORT.md - 代码评审修复报告

---

## 📝 使用说明

### 查看单个文件
所有源代码文件位于 `/home/ubuntu/ear-emg-demo/client/src/` 目录下

### 下载完整源代码
使用 ZIP 文件: ear-emg-complete-source.zip

### 编译和运行
```bash
cd /home/ubuntu/ear-emg-demo
npm install
npm run dev
```

### 构建生产版本
```bash
npm run build
```

---

**版本**: f2946b54  
**最后更新**: 2026-05-19  
**作者**: Manus AI
