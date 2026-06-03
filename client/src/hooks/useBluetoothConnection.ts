/**
 * 蓝牙连接管理 Hook
 * 
 * 功能：
 * - 扫描蓝牙设备
 * - 连接/断开蓝牙设备
 * - 读取蓝牙数据
 * - 发送数据到蓝牙设备
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface BluetoothStatus {
  isConnected: boolean;
  deviceName?: string;
  error?: string;
  isConnecting?: boolean;
}

// 蓝牙 GATT 服务和特征 UUID
// 这些是标准的蓝牙 UART 服务 UUID
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // 接收数据
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // 发送数据

export function useBluetoothConnection() {
  const [status, setStatus] = useState<BluetoothStatus>({
    isConnected: false,
    isConnecting: false,
  });

  const deviceRef = useRef<any>(null);
  const characteristicRef = useRef<any>(null);
  const onDataReceivedRef = useRef<((data: Uint8Array) => void) | null>(null);

  // 检查浏览器是否支持 Web Bluetooth API
  const isBluetoothSupported = useCallback(() => {
    return 'bluetooth' in navigator;
  }, []);

  // 连接蓝牙设备
  const connectBluetooth = useCallback(async () => {
    if (!isBluetoothSupported()) {
      setStatus({
        isConnected: false,
        error: '浏览器不支持 Web Bluetooth API，请使用 Chrome/Edge 等现代浏览器',
      });
      return;
    }

    setStatus((prev) => ({ ...prev, isConnecting: true }));

    try {
      // 请求用户选择蓝牙设备
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [UART_SERVICE_UUID] },
          // 也可以按名称过滤，例如：
          // { namePrefix: 'Arduino' },
          // { namePrefix: 'EMG' },
        ],
        optionalServices: [UART_SERVICE_UUID],
      });

      if (!device) {
        setStatus({
          isConnected: false,
          error: '未选择设备',
          isConnecting: false,
        });
        return;
      }

      // 连接到 GATT 服务器
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE_UUID);

      // 获取接收特征（用于读取数据）
      const rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);

      // 获取发送特征（用于发送数据）
      const txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);

      deviceRef.current = device;
      characteristicRef.current = { rx: rxCharacteristic, tx: txCharacteristic };

      // 监听数据变化
      await rxCharacteristic.startNotifications();
      rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        if (onDataReceivedRef.current) {
          onDataReceivedRef.current(new Uint8Array(value.buffer));
        }
      });

      setStatus({
        isConnected: true,
        deviceName: device.name || 'Bluetooth Device',
        isConnecting: false,
      });

      // 监听设备断开连接
      device.addEventListener('gattserverdisconnected', () => {
        setStatus({
          isConnected: false,
          isConnecting: false,
        });
      });
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        setStatus({
          isConnected: false,
          error: '未找到蓝牙设备',
          isConnecting: false,
        });
      } else if (error.name === 'SecurityError') {
        setStatus({
          isConnected: false,
          error: '蓝牙权限被拒绝',
          isConnecting: false,
        });
      } else if (error.name === 'NetworkError') {
        setStatus({
          isConnected: false,
          error: '蓝牙连接失败',
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
  }, [isBluetoothSupported]);

  // 断开蓝牙连接
  const disconnectBluetooth = useCallback(async () => {
    if (deviceRef.current) {
      try {
        if (characteristicRef.current?.rx) {
          await characteristicRef.current.rx.stopNotifications();
        }
        deviceRef.current.gatt.disconnect();
      } catch (error) {
        console.error('断开连接错误:', error);
      }
      deviceRef.current = null;
      characteristicRef.current = null;
    }

    setStatus({
      isConnected: false,
      isConnecting: false,
    });
  }, []);

  // 发送数据到蓝牙设备
  const sendData = useCallback(async (data: string | Uint8Array) => {
    if (!characteristicRef.current?.tx) {
      setStatus((prev) => ({
        ...prev,
        error: '蓝牙设备未连接或不支持写入',
      }));
      return;
    }

    try {
      let bytes: Uint8Array;
      if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data);
      } else {
        bytes = data;
      }

      await characteristicRef.current.tx.writeValue(bytes);
    } catch (error: any) {
      setStatus((prev) => ({
        ...prev,
        error: error.message || '发送数据失败',
      }));
    }
  }, []);

  // 设置数据接收回调
  const onDataReceived = useCallback((callback: (data: Uint8Array) => void) => {
    onDataReceivedRef.current = callback;
  }, []);

  // 清理资源
  useEffect(() => {
    return () => {
      disconnectBluetooth();
    };
  }, [disconnectBluetooth]);

  return {
    status,
    connectBluetooth,
    disconnectBluetooth,
    sendData,
    onDataReceived,
    isBluetoothSupported,
  };
}
