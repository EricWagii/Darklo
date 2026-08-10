import React, { useState, useCallback, useEffect, useRef } from 'react';
import { addDebugLog } from '@/components/DebugPanel';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

interface SerialConnectionState {
  isConnected: boolean;
  port: SerialPort | null;
  error: string | null;
}

interface SerialData {
  channel1: number;
  channel2: number;
  channel3: number;
  timestamp: number;
}

export function useSerialConnection() {
  const [state, setState] = useState<SerialConnectionState>({
    isConnected: false,
    port: null,
    error: null,
  });

  const dataCallbacksRef = useRef<Set<(data: SerialData) => void>>(new Set());
  const bufferRef = useRef<number[]>([]);

  // 检查浏览器是否支持 Web Serial API
  const isSupported = useCallback(() => {
    return 'serial' in navigator;
  }, []);

  // 请求端口
  const requestPort = useCallback(async () => {
    try {
      if (!isSupported()) {
        throw new Error('浏览器不支持 Web Serial API');
      }

      const serial = (navigator as any).serial;
      const port = await serial.requestPort();
      return port;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setState(prev => ({
        ...prev,
        error: `请求端口失败: ${errorMsg}`
      }));
      return null;
    }
  }, [isSupported]);

  // 连接端口
  const connect = useCallback(async (
    targetPort?: SerialPort,
    baudRate: number = HARDWARE_CONFIG.BAUD_RATE
  ) => {
    try {
      if (!targetPort && !state.port) {
        throw new Error('未指定端口');
      }

      const port = targetPort || state.port;
      if (!port) {
        throw new Error('端口未初始化');
      }

      // 打开端口
      await port.open({ baudRate });
      addDebugLog(`端口已打开，波特率: ${baudRate}`);

      const reader = port.readable.getReader();
      readerRef.current = reader;

      // 异步读取数据
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            // 处理接收到的数据
            if (value) {
              const bytes = Array.from(value as any) as number[];
              addDebugLog(`收到数据: ${bytes.length} 字节`);
              bufferRef.current.push(...bytes);
              addDebugLog(`缓冲区大小: ${bufferRef.current.length}`);
              parseSerialData();
            }
          }
        } catch (err) {
          console.error('读取数据出错:', err);
          setState(prev => ({
            ...prev,
            isConnected: false,
            error: '数据读取中断'
          }));
        }
      })();

      setState(prev => ({
        ...prev,
        isConnected: true,
        port: targetPort || prev.port,
        error: null
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setState(prev => ({
        ...prev,
        error: `连接失败: ${errorMsg}`
      }));
    }
  }, [state.port]);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // 断开连接
  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }

      if (state.port) {
        await state.port.close();
      }

      bufferRef.current = [];
      setState(prev => ({
        ...prev,
        isConnected: false,
        port: null,
        error: null
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setState(prev => ({
        ...prev,
        error: `断开连接失败: ${errorMsg}`
      }));
    }
  }, [state.port]);

  // 解析串口数据
  // 新格式: [CC CC 01 06] [CH1_H] [CH1_L] [CH2_H] [CH2_L] [CH3_H] [CH3_L]
  // 帧头: CC CC 01 06 (4字节)
  // 数据: 6字节 (3通道 x 2字节，大端序 int16)
  // 总长: 10字节
  const parseSerialData = useCallback(() => {
    const FRAME_HEADER = [0xCC, 0xCC, 0x01, 0x06];
    const FRAME_LENGTH = 10; // 4字节帧头 + 6字节数据

    while (bufferRef.current.length >= FRAME_LENGTH) {
      // 查找帧头 CC CC 01 06
      let frameIndex = -1;
      for (let i = 0; i <= bufferRef.current.length - FRAME_LENGTH; i++) {
        if (
          bufferRef.current[i] === FRAME_HEADER[0] &&
          bufferRef.current[i + 1] === FRAME_HEADER[1] &&
          bufferRef.current[i + 2] === FRAME_HEADER[2] &&
          bufferRef.current[i + 3] === FRAME_HEADER[3]
        ) {
          frameIndex = i;
          break;
        }
      }

      if (frameIndex === -1) {
        // 没有找到帧头，清空缓冲区
        bufferRef.current = [];
        break;
      }

      // 移除帧头之前的数据
      if (frameIndex > 0) {
        bufferRef.current = bufferRef.current.slice(frameIndex);
      }

      // 检查是否有足够的数据
      if (bufferRef.current.length < FRAME_LENGTH) {
        break;
      }

      // 提取数据部分（跳过4字节帧头）
      const payload = bufferRef.current.slice(4, 10);

      // 大端序 int16 转换函数
      const toInt16BE = (hi: number, lo: number): number => {
        const u = (hi << 8) | lo;
        return u >= 0x8000 ? u - 0x10000 : u;
      };

      // 解析三个通道（大端序 int16）
      const ch1 = toInt16BE(payload[0], payload[1]);  // 原始ADC（含直流偏置）
      const ch2 = toInt16BE(payload[2], payload[3]);  // 去偏置肌电信号 ← 主信号
      const ch3 = toInt16BE(payload[4], payload[5]);  // 包络/辅助

      const data: SerialData = {
        channel1: ch1,
        channel2: ch2,
        channel3: ch3,
        timestamp: Date.now()
      };
      addDebugLog(`解析成功: CH1=${ch1} CH2=${ch2} CH3=${ch3}`);

      // 调用所有数据回调函数
      if (dataCallbacksRef.current.size > 0) {
        addDebugLog('调用数据回调');
        dataCallbacksRef.current.forEach((callback) => {
          try {
            callback(data);
          } catch (callbackError) {
            console.error('[Serial] 数据回调执行失败:', callbackError);
          }
        });
      } else {
        console.warn('[Serial] 没有注册数据回调');
        addDebugLog('没有注册数据回调', 'warn');
      }

      // 移除已处理的数据
      bufferRef.current = bufferRef.current.slice(FRAME_LENGTH);
    }
  }, []);

  // 设置数据接收回调
  const onDataReceived = useCallback((callback: (data: SerialData) => void) => {
    dataCallbacksRef.current.add(callback);
    return () => {
      dataCallbacksRef.current.delete(callback);
    };
  }, []);

  // 发送数据到设备
  const sendData = useCallback(async (data: Uint8Array) => {
    try {
      if (!state.port || !state.isConnected) {
        throw new Error('端口未连接');
      }

      const writer = state.port.writable?.getWriter();
      if (!writer) {
        throw new Error('无法获取写入器');
      }

      await writer.write(data);
      writer.releaseLock();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setState(prev => ({
        ...prev,
        error: `发送数据失败: ${errorMsg}`
      }));
    }
  }, [state.port, state.isConnected]);

  // 监听端口变化
  useEffect(() => {
    if (!isSupported()) return;

    const serial = (navigator as any).serial;
    if (!serial) return;

    const handleConnect = (event: any) => {
    };

    const handleDisconnect = (event: any) => {
      if (state.port === event.port) {
        disconnect();
      }
    };

    serial.addEventListener('connect', handleConnect);
    serial.addEventListener('disconnect', handleDisconnect);

    return () => {
      serial.removeEventListener('connect', handleConnect);
      serial.removeEventListener('disconnect', handleDisconnect);
    };
  }, [isSupported, state.port, disconnect]);

  return {
    ...state,
    isSupported,
    requestPort,
    connect,
    disconnect,
    onDataReceived,
    sendData,
  };
}
