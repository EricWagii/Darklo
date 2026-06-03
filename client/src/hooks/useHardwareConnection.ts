/**
 * 硬件连接管理 Hook
 * 
 * 功能：
 * - 检测硬件连接状态
 * - 连接/断开硬件
 * - 读取硬件数据
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface HardwareStatus {
  isConnected: boolean;
  deviceName?: string;
  error?: string;
  isConnecting?: boolean;
}

export function useHardwareConnection() {
  const [status, setStatus] = useState<HardwareStatus>({
    isConnected: false,
    isConnecting: false,
  });

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);

  // 检查浏览器是否支持 Web Serial API
  const isSerialSupported = useCallback(() => {
    return 'serial' in navigator;
  }, []);

  // 连接硬件
  const connectHardware = useCallback(async () => {
    if (!isSerialSupported()) {
      setStatus({
        isConnected: false,
        error: '浏览器不支持 Web Serial API，请使用 Chrome/Edge 等现代浏览器',
      });
      return;
    }

    setStatus((prev) => ({ ...prev, isConnecting: true }));

    try {
      // 请求用户选择端口
      const port = await (navigator as any).serial.requestPort();
      
      // 打开端口
      await port.open({ baudRate: 115200 });

      portRef.current = port;

      setStatus({
        isConnected: true,
        deviceName: port.getInfo().usbProductName || 'Arduino Device',
        isConnecting: false,
      });

      // 开始读取数据
      readData();
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        setStatus({
          isConnected: false,
          error: '未选择设备',
          isConnecting: false,
        });
      } else if (error.name === 'InvalidStateError') {
        setStatus({
          isConnected: false,
          error: '端口已被占用',
          isConnecting: false,
        });
      } else {
        setStatus({
          isConnected: false,
          error: error.message || '连接失败',
          isConnecting: false,
        });
      }
    }
  }, [isSerialSupported]);

  // 读取数据
  const readData = useCallback(async () => {
    if (!portRef.current) return;

    try {
      const reader = portRef.current.readable.getReader();
      readerRef.current = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // 数据会通过回调函数返回
      }
    } catch (error) {
      console.error('读取数据错误:', error);
    }
  }, []);

  // 断开硬件
  const disconnectHardware = useCallback(async () => {
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (error) {
        console.error('取消读取错误:', error);
      }
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (error) {
        console.error('关闭端口错误:', error);
      }
      portRef.current = null;
    }

    setStatus({
      isConnected: false,
      isConnecting: false,
    });
  }, []);

  // 发送数据到硬件
  const sendData = useCallback(async (data: string) => {
    if (!portRef.current || !portRef.current.writable) {
      setStatus((prev) => ({
        ...prev,
        error: '硬件未连接或不支持写入',
      }));
      return;
    }

    try {
      const writer = portRef.current.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(data));
      writer.releaseLock();
    } catch (error: any) {
      setStatus((prev) => ({
        ...prev,
        error: error.message || '发送数据失败',
      }));
    }
  }, []);

  // 清理资源
  useEffect(() => {
    return () => {
      disconnectHardware();
    };
  }, [disconnectHardware]);

  return {
    status,
    connectHardware,
    disconnectHardware,
    sendData,
    isSerialSupported,
  };
}
