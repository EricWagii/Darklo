# 采集数据完整导出设计文档

## 概述

采集数据导出功能需要包含**两次裁剪的完整操作数据**，用于深度分析和参数优化。

## 导出数据结构

### 1. 基本信息
```json
{
  "exportTime": "2026-05-20T10:30:00.000Z",
  "exportVersion": "2.0",
  "metadata": {
    "commandName": "666",
    "collectionIndex": 1,
    "collectionTimestamp": "2026-05-20T10:25:00.000Z",
    "samplingRate": 500,
    "totalSamples": 2560
  }
}
```

### 2. 原始波形数据
```json
{
  "rawWaveform": {
    "ch1": [数值数组],
    "ch2": [数值数组],
    "ch3": [数值数组],
    "duration": 5120,
    "samplingRate": 500,
    "totalSamples": 2560
  }
}
```

### 3. 第一次裁剪（能量检测裁剪）
```json
{
  "firstCropping": {
    "algorithm": "energy-detection",
    "parameters": {
      "energyThreshold": 0.35,
      "minValidLength": 50,
      "peakDetectionWindow": 20
    },
    "energyAnalysis": {
      "energyValues": [数值数组],
      "threshold": 0.35,
      "validSegmentStart": 150,
      "validSegmentEnd": 1800,
      "validSegmentLength": 1650,
      "confidence": 0.92
    },
    "peakDetection": {
      "peaks": [
        {
          "index": 500,
          "value": 0.85,
          "width": 40
        }
      ],
      "peakCount": 1,
      "strategy": "single-peak"
    },
    "result": {
      "startIdx": 130,
      "endIdx": 1820,
      "length": 1690,
      "durationMs": 3380,
      "reason": "能量检测自动裁剪"
    }
  }
}
```

### 4. 第二次裁剪（固定长度裁剪）
```json
{
  "secondCropping": {
    "algorithm": "fixed-length",
    "parameters": {
      "fixedLength": 512,
      "alignmentStrategy": "center"
    },
    "input": {
      "startIdx": 130,
      "endIdx": 1820,
      "length": 1690,
      "durationMs": 3380
    },
    "result": {
      "startIdx": 364,
      "endIdx": 876,
      "length": 512,
      "durationMs": 1024,
      "alignmentOffset": 234,
      "reason": "固定长度512采样点"
    }
  }
}
```

### 5. 时长统计
```json
{
  "timingStats": {
    "rawDurationMs": 5120,
    "afterFirstCroppingMs": 3380,
    "afterSecondCroppingMs": 1024,
    "samplingRate": 500,
    "timingAnalysis": {
      "rawToFirstCropRatio": 1.51,
      "firstCropToSecondCropRatio": 3.30,
      "rawToSecondCropRatio": 5.00,
      "isRawTooLong": false,
      "isFirstCropTooLong": true,
      "recommendation": "原始时长5.12秒，第一次裁剪后3.38秒，仍超过目标1.024秒，建议调整能量阈值或增加固定长度"
    }
  }
}
```

### 6. 质量评分
```json
{
  "qualityScore": {
    "isAcceptable": true,
    "score": 82,
    "factors": {
      "energyConfidence": 0.92,
      "peakQuality": 0.85,
      "lengthAppropriateness": 0.75,
      "noiseLevel": 0.88
    },
    "issues": [
      "第一次裁剪后时长(3.38s)仍超过固定长度(1.024s)"
    ],
    "recommendations": [
      "考虑降低能量阈值以获得更紧凑的裁剪",
      "或增加FIXED_WAVEFORM_LENGTH参数"
    ]
  }
}
```

### 7. 识别结果（如果已进行识别）
```json
{
  "recognitionResult": {
    "predictedCommand": "666",
    "confidence": 0.94,
    "isCorrect": true,
    "processingTimeMs": 45,
    "modelVersion": "v1.0"
  }
}
```

### 8. 完整的波形片段（用于可视化）
```json
{
  "waveformSegments": {
    "raw": {
      "ch1": [完整的原始波形],
      "startIdx": 0,
      "endIdx": 2560
    },
    "afterFirstCropping": {
      "ch1": [第一次裁剪后的波形],
      "startIdx": 130,
      "endIdx": 1820
    },
    "afterSecondCropping": {
      "ch1": [第二次裁剪后的波形],
      "startIdx": 364,
      "endIdx": 876
    }
  }
}
```

## 导出格式

### JSON格式
- **用途**：完整的数据分析，包含所有原始数据和中间过程
- **文件名**：`collection-{commandName}-{timestamp}.json`
- **大小**：约100-200KB（包含完整波形数据）

### CSV格式（汇总表）
- **用途**：快速对比多条采集，便于在Excel中分析
- **文件名**：`collection-{commandName}-{timestamp}.csv`
- **内容**：

```
指令,采集序号,采集时间,原始时长(ms),第一次裁剪后(ms),第二次裁剪后(ms),能量置信度,峰值数,质量评分,是否可接受,识别结果,识别置信度,是否正确
666,1,2026-05-20T10:25:00Z,5120,3380,1024,0.92,1,82,是,666,0.94,是
```

## 批量导出

### 批量导出文件结构
```
collections-export-2026-05-20-10-30.zip
├── metadata.json (导出元数据)
├── summary.csv (所有采集的汇总表)
├── collections/
│   ├── 666-1.json
│   ├── 666-2.json
│   ├── 888-1.json
│   └── ...
└── analysis-report.md (自动生成的分析报告)
```

### 分析报告内容
- 采集总数和指令分布
- 时长统计（平均值、最大值、最小值、标准差）
- 质量评分分布
- 识别准确率
- 问题汇总和建议

## 关键指标

### 时长分析
- **原始时长**：采集的完整时长
- **第一次裁剪后**：能量检测后的时长
- **第二次裁剪后**：固定长度裁剪后的时长

### 质量指标
- **能量置信度**：0-1，越高越好
- **峰值数**：理想情况下为1（单峰值指令）
- **质量评分**：0-100，>=60为可接受

## 使用场景

### 场景1：单条采集导出
用户完成一条采集后，立即导出该采集的完整数据，用于：
- 查看波形质量
- 检查两次裁剪的参数
- 评估是否需要重新采集

### 场景2：批量导出
用户完成多条采集后，一键导出所有采集数据，用于：
- 对比不同指令的特征
- 分析时长分布
- 找出问题采集
- 生成统计报告

### 场景3：深度分析
将导出的数据发送给开发者，用于：
- 分析是否需要调整FIXED_WAVEFORM_LENGTH
- 优化能量阈值
- 改进裁剪算法
- 诊断识别错误的原因
