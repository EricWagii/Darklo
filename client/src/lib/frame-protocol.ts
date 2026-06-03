/**
 * 改进的帧协议模块
 * 
 * 功能：
 * - 定义标准化的帧结构
 * - 实现帧校验和计算和验证
 * - 支持帧解析和序列化
 * - 防止数据污染和乱帧
 */

/**
 * 帧结构定义
 * 
 * 格式：
 * [帧头 4 字节] + [长度 1 字节] + [数据 6 字节] + [校验和 1 字节]
 * 
 * 帧头：0xCC 0xCC 0x01 0x06 (固定值)
 * 长度：数据长度（通常为 6）
 * 数据：CH1 (int16) + CH2 (int16) + CH3 (int16)
 * 校验和：CRC-8 校验
 */

export interface Frame {
  header: number[];
  length: number;
  data: {
    ch1: number;
    ch2: number;
    ch3: number;
  };
  checksum: number;
  isValid: boolean;
}

export const FRAME_PROTOCOL = {
  HEADER: [0xCC, 0xCC, 0x01, 0x06],
  HEADER_LENGTH: 4,
  LENGTH_FIELD_SIZE: 1,
  DATA_LENGTH: 6, // 3 个 int16
  CHECKSUM_LENGTH: 1,
  TOTAL_FRAME_LENGTH: 12, // 4 + 1 + 6 + 1
};

/**
 * 计算 CRC-8 校验和
 * 使用多项式：x^8 + x^7 + x^6 + x^4 + x^2 + 1 (0xD5)
 * 
 * @param data 数据字节数组
 * @returns CRC-8 校验和
 */
export function calculateCRC8(data: number[]): number {
  const POLYNOMIAL = 0xD5;
  let crc = 0x00;

  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x80) !== 0) {
        crc = ((crc << 1) ^ POLYNOMIAL) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }

  return crc;
}

/**
 * 序列化帧数据
 * 
 * @param ch1 通道 1 数据 (int16)
 * @param ch2 通道 2 数据 (int16)
 * @param ch3 通道 3 数据 (int16)
 * @returns 完整的帧字节数组
 */
export function serializeFrame(ch1: number, ch2: number, ch3: number): number[] {
  const frame: number[] = [];

  // 1. 添加帧头
  frame.push(...FRAME_PROTOCOL.HEADER);

  // 2. 添加长度字段
  frame.push(FRAME_PROTOCOL.DATA_LENGTH);

  // 3. 添加数据（大端序）
  frame.push((ch1 >> 8) & 0xFF, ch1 & 0xFF);
  frame.push((ch2 >> 8) & 0xFF, ch2 & 0xFF);
  frame.push((ch3 >> 8) & 0xFF, ch3 & 0xFF);

  // 4. 计算校验和（包括长度字段和数据）
  const dataToChecksum = frame.slice(4); // 从长度字段开始
  const checksum = calculateCRC8(dataToChecksum);

  // 5. 添加校验和
  frame.push(checksum);

  return frame;
}

/**
 * 反序列化帧数据
 * 
 * @param frameData 帧字节数组
 * @returns 解析结果
 */
export function deserializeFrame(frameData: number[]): Frame {
  const frame: Frame = {
    header: [],
    length: 0,
    data: { ch1: 0, ch2: 0, ch3: 0 },
    checksum: 0,
    isValid: false,
  };

  // 检查最小长度
  if (frameData.length < FRAME_PROTOCOL.TOTAL_FRAME_LENGTH) {
    console.warn(
      `[Frame] 帧长度不足：${frameData.length} < ${FRAME_PROTOCOL.TOTAL_FRAME_LENGTH}`
    );
    return frame;
  }

  // 1. 验证帧头
  frame.header = frameData.slice(0, FRAME_PROTOCOL.HEADER_LENGTH);
  const headerMatch = frame.header.every(
    (byte, idx) => byte === FRAME_PROTOCOL.HEADER[idx]
  );

  if (!headerMatch) {
    console.warn(
      `[Frame] 帧头不匹配：${frame.header.map(b => '0x' + b.toString(16).toUpperCase()).join(' ')}`
    );
    return frame;
  }

  // 2. 获取长度字段
  frame.length = frameData[FRAME_PROTOCOL.HEADER_LENGTH];

  if (frame.length !== FRAME_PROTOCOL.DATA_LENGTH) {
    console.warn(`[Frame] 长度字段错误：${frame.length} != ${FRAME_PROTOCOL.DATA_LENGTH}`);
    return frame;
  }

  // 3. 解析数据
  const dataStart = FRAME_PROTOCOL.HEADER_LENGTH + FRAME_PROTOCOL.LENGTH_FIELD_SIZE;
  const dataEnd = dataStart + FRAME_PROTOCOL.DATA_LENGTH;

  if (frameData.length < dataEnd + 1) {
    console.warn(`[Frame] 数据不完整`);
    return frame;
  }

  // 大端序解析
  frame.data.ch1 = ((frameData[dataStart] << 8) | frameData[dataStart + 1]) & 0xFFFF;
  frame.data.ch2 = ((frameData[dataStart + 2] << 8) | frameData[dataStart + 3]) & 0xFFFF;
  frame.data.ch3 = ((frameData[dataStart + 4] << 8) | frameData[dataStart + 5]) & 0xFFFF;

  // 处理有符号整数
  if (frame.data.ch1 & 0x8000) frame.data.ch1 = frame.data.ch1 - 0x10000;
  if (frame.data.ch2 & 0x8000) frame.data.ch2 = frame.data.ch2 - 0x10000;
  if (frame.data.ch3 & 0x8000) frame.data.ch3 = frame.data.ch3 - 0x10000;

  // 4. 验证校验和
  frame.checksum = frameData[dataEnd];
  const dataToChecksum = frameData.slice(
    FRAME_PROTOCOL.HEADER_LENGTH,
    dataEnd
  );
  const calculatedChecksum = calculateCRC8(dataToChecksum);

  if (frame.checksum !== calculatedChecksum) {
    console.warn(
      `[Frame] 校验和错误：${frame.checksum} != ${calculatedChecksum}`
    );
    return frame;
  }

  frame.isValid = true;
  return frame;
}

/**
 * 在字节流中查找帧头
 * 
 * @param buffer 字节缓冲区
 * @param startIdx 开始搜索的索引
 * @returns 帧头位置，未找到返回 -1
 */
export function findFrameHeader(buffer: number[], startIdx: number = 0): number {
  for (let i = startIdx; i <= buffer.length - FRAME_PROTOCOL.HEADER_LENGTH; i++) {
    let match = true;
    for (let j = 0; j < FRAME_PROTOCOL.HEADER_LENGTH; j++) {
      if (buffer[i + j] !== FRAME_PROTOCOL.HEADER[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

/**
 * 从字节流中提取完整的帧
 * 
 * @param buffer 字节缓冲区
 * @returns { frame, nextIdx } 提取的帧和下一个搜索位置
 */
export function extractFrame(
  buffer: number[]
): { frame: Frame | null; nextIdx: number } {
  const headerIdx = findFrameHeader(buffer);

  if (headerIdx === -1) {
    return { frame: null, nextIdx: buffer.length };
  }

  if (headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH > buffer.length) {
    // 帧不完整
    return { frame: null, nextIdx: headerIdx };
  }

  const frameData = buffer.slice(
    headerIdx,
    headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH
  );
  const frame = deserializeFrame(frameData);

  return {
    frame: frame.isValid ? frame : null,
    nextIdx: headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH,
  };
}

export default {
  FRAME_PROTOCOL,
  calculateCRC8,
  serializeFrame,
  deserializeFrame,
  findFrameHeader,
  extractFrame,
};
