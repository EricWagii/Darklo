/**
 * 统一的数据模型定义
 * 确保整个系统使用一致的数据结构
 */

export interface Waveform {
  ch1: number[];
  ch2: number[];
  ch3: number[];
}

export interface CollectionData {
  index: number;
  timestamp: number;  // 统一使用 number (milliseconds since epoch)
  waveform: Waveform;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  userId?: string;
  userName?: string;
  quality?: number;  // 0-1 的质量分数
}

export interface StoredCommand {
  name: string;
  collections: CollectionData[];
  createdAt: number;  // 统一使用 number
  accuracy?: number;
  version: number;  // 数据格式版本
  samplingRate: number;  // 采样率
  lastModified?: number;
}

// 数据版本常量
export const DATA_VERSION = 2;
export const SAMPLE_RATE = 500;

// 类型守卫
export function isStoredCommand(data: any): data is StoredCommand {
  return (
    typeof data === 'object' &&
    typeof data.name === 'string' &&
    Array.isArray(data.collections) &&
    typeof data.createdAt === 'number' &&
    typeof data.version === 'number' &&
    typeof data.samplingRate === 'number'
  );
}

export function isCollectionData(data: any): data is CollectionData {
  return (
    typeof data === 'object' &&
    typeof data.index === 'number' &&
    typeof data.timestamp === 'number' &&
    data.waveform &&
    typeof data.waveform.ch1 === 'object' &&
    typeof data.waveform.ch2 === 'object' &&
    typeof data.waveform.ch3 === 'object' &&
    typeof data.duration === 'number'
  );
}

export default {
  DATA_VERSION,
  SAMPLE_RATE,
  isStoredCommand,
  isCollectionData,
};
