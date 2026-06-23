# 串口协议修改说明

## 背景

通过串口调试工具验证，STM32 当前发送的数据格式如下：

- **帧头**：`CC CC 01 06`（4字节）
- **数据**：3通道 × 2字节 = 6字节，**大端序（Big-Endian）int16 有符号**
- **帧总长**：10字节
- **波特率**：115200

## 三通道含义

| 通道 | 实际含义 | 数值范围 | 用途 |
|---|---|---|---|
| CH1 | ADC原始值（含直流偏置约2000） | int16约 ±4094 | 原始参考，不直接用于识别 |
| CH2 | 去偏置后的肌电信号 | int16约 ±120~±300 | **主要信号，用于波形显示和特征提取** |
| CH3 | 包络/辅助值 | 约136，变化极小 | 可用作强度参考 |

## 需要修改的内容

### 1. 帧解析函数

将原来的帧头（可能是 `FF` 或其他格式）改为：

```javascript
// 帧头识别
const FRAME_HEADER = [0xCC, 0xCC, 0x01, 0x06];
const FRAME_LENGTH = 10; // 4字节帧头 + 6字节数据

function parseFrame(buf) {
  // 在缓冲区中搜索帧头 CC CC 01 06
  for (let i = 0; i <= buf.length - FRAME_LENGTH; i++) {
    if (buf[i] === 0xCC && buf[i+1] === 0xCC && 
        buf[i+2] === 0x01 && buf[i+3] === 0x06) {
      
      const payload = buf.slice(i + 4, i + 10);
      
      // 大端序 int16 解析
      function toInt16BE(hi, lo) {
        const u = (hi << 8) | lo;
        return u >= 0x8000 ? u - 0x10000 : u;
      }
      
      return {
        ch1: toInt16BE(payload[0], payload[1]),  // 原始ADC（含偏置）
        ch2: toInt16BE(payload[2], payload[3]),  // 去偏置肌电信号 ← 主信号
        ch3: toInt16BE(payload[4], payload[5]),  // 包络/辅助
        consumed: i + FRAME_LENGTH
      };
    }
  }
  return null;
}
```

### 2. 主信号通道

将所有原来读取 `ch1` 或 `channel[0]` 作为肌电信号的地方，改为读取 `ch2` / `channel[1]`：

```javascript
// 原来可能是：
const emgValue = parsedData.ch1;  // ❌ 错误，ch1含直流偏置

// 改为：
const emgValue = parsedData.ch2;  // ✅ 正确，ch2已去偏置
```

### 3. 波形显示 Y 轴范围

CH2 实测幅值约 ±120（安静时），肌肉收缩时约 ±300，建议：

```javascript
const Y_AXIS_MIN = -400;
const Y_AXIS_MAX = 400;
// 不要使用自动缩放，否则噪声会被放大
```

### 4. 如果有滤波处理

CH2 已经是去偏置信号，可以直接对其做：
- 高通滤波（截止频率约 10–20 Hz，去除运动伪迹）
- 低通滤波（截止频率约 400–500 Hz，去除高频噪声）
- 50 Hz 陷波（去除工频干扰）

不需要再减基线，因为 CH2 已经围绕 0 波动。

### 5. 如果需要用 CH1（可选）

CH1 含约 2000 的直流偏置，如需使用需先减去基线：

```javascript
// 动态计算基线（前100个采样点的均值）
const baseline = ch1Samples.slice(0, 100).reduce((a,b) => a+b, 0) / 100;
const ch1Centered = ch1Raw - baseline;
```

## 修改涉及的文件

根据项目结构，以下文件需要修改：

1. **`client/src/hooks/useSerialConnection.ts`** - 串口数据接收和解析
2. **`client/src/lib/serial-port.ts`** - 帧解析逻辑
3. **`client/src/components/EnhancedWaveformVisualization.tsx`** - 波形显示的 Y 轴范围
4. **`client/src/lib/dsp-processor.ts`** - 特征提取中的通道选择

## 验证步骤

1. 连接 STM32 设备
2. 打开浏览器开发者工具（F12）
3. 在控制台中查看接收到的数据帧
4. 验证帧头是否为 `CC CC 01 06`
5. 验证 CH2 的数值范围是否约为 ±120~±300
6. 验证波形显示是否正确

---

**完成日期**：2026年5月14日  
**版本**：1.0
