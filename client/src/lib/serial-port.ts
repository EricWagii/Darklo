/**
 * Web Serial API 硬件通信模块
 * 
 * 功能：
 * - 串口连接管理
 * - 数据读取和解析
 * - 错误处理和重连
 */

import { HARDWARE_CONFIG } from '@/../../shared/const';
import type { } from '../types/serial';

export interface EMGData {
  timestamp: number;
  channels: [number, number, number]; // 3个通道的数据
}

export class SerialPortManager {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private isReading = false;
  private callbacks: ((data: EMGData) => void)[] = [];

  /**
   * 检查浏览器是否支持 Web Serial API
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * 连接到串口设备
   */
  async connect(): Promise<void> {
    if (!SerialPortManager.isSupported()) {
      throw new Error('浏览器不支持 Web Serial API。请使用 Chrome、Edge 等现代浏览器。');
    }

    try {
      // 请求用户选择串口
      if (!navigator.serial) {
        throw new Error('Web Serial API 不可用');
      }
      this.port = (await navigator.serial.requestPort()) as any;

      // 打开串口
      await this.port.open({
        baudRate: HARDWARE_CONFIG.BAUD_RATE,
      });
      this.startReading();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      console.error('串口连接失败:', error);
      
      if (message.includes('permissions policy') || message.includes('disallowed')) {
        throw new Error('权限被拒绝：Web Serial API 需要特定的权限配置。系统已自动配置，请刷新页面后重试。');
      }
      
      if (message.includes('cancelled') || message.includes('Cancelled')) {
        throw new Error('用户取消了设备选择');
      }
      
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.isReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (error) {
        console.error('取消读取失败:', error);
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (error) {
        console.error('关闭串口失败:', error);
      }
      this.port = null;
    }
  }

  /**
   * 开始读取数据
   */
  async startReading(): Promise<void> {
    if (!this.port || !this.port.readable) {
      throw new Error('串口未连接');
    }

    this.isReading = true;
    this.reader = (this.port.readable as any).getReader();

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();

        if (done) {
          break;
        }

        if (value) {
          this.parseData(value);
        }
      }
    } catch (error) {
      console.error('读取数据失败:', error);
      this.isReading = false;
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  /**
   * 停止读取数据
   */
  stopReading(): void {
    this.isReading = false;
  }

  /**
   * 注册数据回调
   */
  onData(callback: (data: EMGData) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * 移除数据回调
   */
  offData(callback: (data: EMGData) => void): void {
    this.callbacks = this.callbacks.filter((cb) => cb !== callback);
  }

  /**
   * 解析串口数据
   * 
   * 假设硬件发送格式：
   * "CH1:value1,CH2:value2,CH3:value3\n"
   * 或二进制格式需要自定义解析
   */
  private parseData(data: string): void {
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        // 尝试解析文本格式
        const values = this.parseTextFormat(line);
        if (values) {
          const emgData: EMGData = {
            timestamp: Date.now(),
            channels: values,
          };

          // 触发所有回调
          this.callbacks.forEach((callback) => {
            try {
              callback(emgData);
            } catch (error) {
              console.error('回调执行失败:', error);
            }
          });
        }
      } catch (error) {
        console.error('数据解析失败:', error);
      }
    }
  }

  /**
   * 解析文本格式数据
   * 格式示例: "100,200,300" 或 "CH1:100,CH2:200,CH3:300"
   */
  private parseTextFormat(line: string): [number, number, number] | null {
    const line_trimmed = line.trim();

    // 格式1: "100,200,300"
    const match1 = line_trimmed.match(/^(\d+),(\d+),(\d+)$/);
    if (match1) {
      return [parseInt(match1[1]), parseInt(match1[2]), parseInt(match1[3])];
    }

    // 格式2: "CH1:100,CH2:200,CH3:300"
    const match2 = line_trimmed.match(
      /CH1:(\d+),CH2:(\d+),CH3:(\d+)/
    );
    if (match2) {
      return [parseInt(match2[1]), parseInt(match2[2]), parseInt(match2[3])];
    }

    return null;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.port !== null;
  }
}

// 创建全局单例
export const serialPortManager = new SerialPortManager();
