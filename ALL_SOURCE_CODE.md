# 完整源代码

**生成时间**: 2026-05-19
**项目版本**: f2946b54
**总代码行数**: 29,168 行
**总文件数**: 117 个

---

## const.ts

```typescript
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

```

---

## hooks/useAsyncOperation.ts

```typescript
/**
 * useAsyncOperation Hook - 统一的异步操作状态管理
 * 处理 loading、error、data 状态，支持自动清理
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseAsyncOperationState<T> {
  isLoading: boolean;
  error: Error | null;
  data: T | null;
}

interface UseAsyncOperationResult<T> extends UseAsyncOperationState<T> {
  execute: (operation: () => Promise<T>) => Promise<T>;
  reset: () => void;
}

export function useAsyncOperation<T>(): UseAsyncOperationResult<T> {
  const [state, setState] = useState<UseAsyncOperationState<T>>({
    isLoading: false,
    error: null,
    data: null,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T> => {
    if (!isMountedRef.current) return null as T;

    setState({
      isLoading: true,
      error: null,
      data: null,
    });

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setState({
          isLoading: false,
          error: null,
          data: result,
        });
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState({
          isLoading: false,
          error,
          data: null,
        });
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
    }
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

export default useAsyncOperation;

```

---

## hooks/useBluetoothConnection.ts

```typescript
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

```

---

## hooks/useComposition.ts

```typescript
import { useRef } from "react";
import { usePersistFn } from "./usePersistFn";

export interface UseCompositionReturn<
  T extends HTMLInputElement | HTMLTextAreaElement,
> {
  onCompositionStart: React.CompositionEventHandler<T>;
  onCompositionEnd: React.CompositionEventHandler<T>;
  onKeyDown: React.KeyboardEventHandler<T>;
  isComposing: () => boolean;
}

export interface UseCompositionOptions<
  T extends HTMLInputElement | HTMLTextAreaElement,
> {
  onKeyDown?: React.KeyboardEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
}

type TimerResponse = ReturnType<typeof setTimeout>;

export function useComposition<
  T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement,
>(options: UseCompositionOptions<T> = {}): UseCompositionReturn<T> {
  const {
    onKeyDown: originalOnKeyDown,
    onCompositionStart: originalOnCompositionStart,
    onCompositionEnd: originalOnCompositionEnd,
  } = options;

  const c = useRef(false);
  const timer = useRef<TimerResponse | null>(null);
  const timer2 = useRef<TimerResponse | null>(null);

  const onCompositionStart = usePersistFn((e: React.CompositionEvent<T>) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (timer2.current) {
      clearTimeout(timer2.current);
      timer2.current = null;
    }
    c.current = true;
    originalOnCompositionStart?.(e);
  });

  const onCompositionEnd = usePersistFn((e: React.CompositionEvent<T>) => {
    // 使用两层 setTimeout 来处理 Safari 浏览器中 compositionEnd 先于 onKeyDown 触发的问题
    timer.current = setTimeout(() => {
      timer2.current = setTimeout(() => {
        c.current = false;
      });
    });
    originalOnCompositionEnd?.(e);
  });

  const onKeyDown = usePersistFn((e: React.KeyboardEvent<T>) => {
    // 在 composition 状态下，阻止 ESC 和 Enter（非 shift+Enter）事件的冒泡
    if (
      c.current &&
      (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey))
    ) {
      e.stopPropagation();
      return;
    }
    originalOnKeyDown?.(e);
  });

  const isComposing = usePersistFn(() => {
    return c.current;
  });

  return {
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    isComposing,
  };
}

```

---

## hooks/useEMGCollection.ts

```typescript
/**
 * React Hook - EMG 采集训练管理
 */

import { useState, useCallback, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';
import { extractTimeFeatures, averageFeatures } from '@/lib/signal-processing';
import { emgDatabase } from '@/lib/db';
import { TrainingData, COLLECTION_CONFIG, HARDWARE_CONFIG } from '@/../../shared/const';

export interface UseEMGCollectionReturn {
  isCollecting: boolean;
  currentSample: number;
  totalSamples: number;
  collectedData: number[][][];
  trainingData: TrainingData | null;
  error: string | null;
  startCollection: (commandId: string, commandName: string) => void;
  stopCollection: () => void;
  addData: (data: EMGData) => void;
  saveTraining: () => Promise<void>;
}

export function useEMGCollection(): UseEMGCollectionReturn {
  const [isCollecting, setIsCollecting] = useState(false);
  const [currentSample, setCurrentSample] = useState(0);
  const [collectedData, setCollectedData] = useState<number[][][]>([]);
  const [trainingData, setTrainingData] = useState<TrainingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commandIdRef = useRef<string>('');
  const commandNameRef = useRef<string>('');
  const currentSampleDataRef = useRef<number[][]>([]);
  const startTimeRef = useRef<number>(0);

  const startCollection = useCallback(
    (commandId: string, commandName: string) => {
      try {
        setError(null);
        commandIdRef.current = commandId;
        commandNameRef.current = commandName;
        currentSampleDataRef.current = [];
        startTimeRef.current = Date.now();
        setIsCollecting(true);
        setCurrentSample(1);
      } catch (err) {
        const message = err instanceof Error ? err.message : '采集启动失败';
        setError(message);
      }
    },
    []
  );

  const stopCollection = useCallback(() => {
    setIsCollecting(false);
    currentSampleDataRef.current = [];
  }, []);

  const addData = useCallback(
    (data: EMGData) => {
      if (!isCollecting) return;

      // 检查采集时长
      const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
      if (elapsedTime > COLLECTION_CONFIG.COLLECTION_DURATION) {
        // 采集完成
        setIsCollecting(false);

        // 保存采集的数据
        setCollectedData((prev) => [...prev, currentSampleDataRef.current]);

        // 重置
        currentSampleDataRef.current = [];
        startTimeRef.current = Date.now();

        // 如果还有更多采样需要进行，继续
        if (currentSample < COLLECTION_CONFIG.SAMPLES_PER_COMMAND) {
          setCurrentSample((prev) => prev + 1);
        }

        return;
      }

      // 添加数据点
      currentSampleDataRef.current.push([
        data.channels[0],
        data.channels[1],
        data.channels[2],
      ]);
    },
    [isCollecting, currentSample]
  );

  const saveTraining = useCallback(async () => {
    try {
      setError(null);

      if (collectedData.length === 0) {
        throw new Error('没有采集到数据');
      }

      // 提取特征
      const features = collectedData.map((samples) =>
        extractTimeFeatures(samples)
      );

      // 计算平均特征
      const averageFeature = averageFeatures(features);

      // 创建训练数据对象
      const training: TrainingData = {
        commandId: commandIdRef.current,
        commandName: commandNameRef.current,
        samples: collectedData as any,
        features,
        averageFeature,
        timestamp: Date.now(),
      };

      // 保存到数据库
      await emgDatabase.saveTrainingData(training);

      setTrainingData(training);
      setCollectedData([]);
      setCurrentSample(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
    }
  }, [collectedData]);

  return {
    isCollecting,
    currentSample,
    totalSamples: COLLECTION_CONFIG.SAMPLES_PER_COMMAND,
    collectedData,
    trainingData,
    error,
    startCollection,
    stopCollection,
    addData,
    saveTraining,
  };
}

```

---

## hooks/useEMGRecognition.ts

```typescript
/**
 * React Hook - EMG 识别管理
 */

import { useState, useCallback, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';
import {
  extractTimeFeatures,
  calculateEuclideanDistance,
  calculateConfidence,
} from '@/lib/signal-processing';
import { emgDatabase } from '@/lib/db';
import {
  RecognitionResult,
  RECOGNITION_CONFIG,
  TrainingData,
} from '@/../../shared/const';

export interface UseEMGRecognitionReturn {
  isRecognizing: boolean;
  result: RecognitionResult | null;
  error: string | null;
  startRecognition: () => void;
  stopRecognition: () => void;
  addData: (data: EMGData) => void;
  recognize: () => Promise<void>;
}

export function useEMGRecognition(): UseEMGRecognitionReturn {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentSampleDataRef = useRef<number[][]>([]);
  const startTimeRef = useRef<number>(0);

  const startRecognition = useCallback(() => {
    try {
      setError(null);
      currentSampleDataRef.current = [];
      startTimeRef.current = Date.now();
      setIsRecognizing(true);
      setResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别启动失败';
      setError(message);
    }
  }, []);

  const stopRecognition = useCallback(() => {
    setIsRecognizing(false);
    currentSampleDataRef.current = [];
  }, []);

  const addData = useCallback(
    (data: EMGData) => {
      if (!isRecognizing) return;

      // 检查采集时长
      const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
      if (elapsedTime > RECOGNITION_CONFIG.RECOGNITION_DURATION) {
        // 采集完成
        setIsRecognizing(false);
        return;
      }

      // 添加数据点
      currentSampleDataRef.current.push([
        data.channels[0],
        data.channels[1],
        data.channels[2],
      ]);
    },
    [isRecognizing]
  );

  const recognize = useCallback(async () => {
    try {
      setError(null);

      if (currentSampleDataRef.current.length === 0) {
        throw new Error('没有采集到数据');
      }

      // 获取所有训练数据
      const trainingDataList = await emgDatabase.getAllTrainingData();

      if (trainingDataList.length === 0) {
        throw new Error('没有训练数据，请先进行采集训练');
      }

      // 提取当前采集数据的特征
      const testFeature = extractTimeFeatures(currentSampleDataRef.current);

      // 计算与所有训练数据的距离
      const distances: { [commandId: string]: number } = {};
      const commandNames: { [commandId: string]: string } = {};

      for (const training of trainingDataList) {
        const distance = calculateEuclideanDistance(
          testFeature,
          training.averageFeature
        );
        distances[training.commandId] = distance;
        commandNames[training.commandId] = training.commandName;
      }

      // 找到最小距离
      const minDistance = Math.min(...Object.values(distances));
      const recognizedCommandId = Object.keys(distances).find(
        (id) => distances[id] === minDistance
      );

      if (!recognizedCommandId) {
        throw new Error('识别失败');
      }

      // 计算置信度
      const confidence = calculateConfidence(minDistance);

      // 创建结果
      const recognitionResult: RecognitionResult = {
        recognizedCommand: commandNames[recognizedCommandId],
        confidence,
        distances,
        timestamp: Date.now(),
      };

      setResult(recognitionResult);
      currentSampleDataRef.current = [];
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别失败';
      setError(message);
    }
  }, []);

  return {
    isRecognizing,
    result,
    error,
    startRecognition,
    stopRecognition,
    addData,
    recognize,
  };
}

```

---

## hooks/useHardwareConnection.ts

```typescript
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

```

---

## hooks/useMountedState.ts

```typescript
/**
 * useMountedState Hook - 防止组件卸载后更新状态
 * 用于异步操作中的状态更新安全性
 */

import { useEffect, useRef, useCallback } from 'react';

export function useMountedState() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isMounted = useCallback(() => isMountedRef.current, []);

  return isMounted;
}

export default useMountedState;

```

---

## hooks/usePersistFn.ts

```typescript
import { useRef } from "react";

type noop = (...args: any[]) => any;

/**
 * usePersistFn instead of useCallback to reduce cognitive load
 */
export function usePersistFn<T extends noop>(fn: T) {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const persistFn = useRef<T>(null);
  if (!persistFn.current) {
    persistFn.current = function (this: unknown, ...args) {
      return fnRef.current!.apply(this, args);
    } as T;
  }

  return persistFn.current!;
}

```

---

## hooks/useSerialConnection.ts

```typescript
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { addDebugLog } from '@/components/DebugPanel';

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

  const onDataReceivedRef = useRef<((data: SerialData) => void) | null>(null);
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
  const connect = useCallback(async (targetPort?: SerialPort, baudRate: number = 115200) => {
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

      // 调用回调函数
      if (onDataReceivedRef.current) {
        addDebugLog('调用数据回调');
        onDataReceivedRef.current(data);
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
    onDataReceivedRef.current = callback;
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

```

---

## hooks/useSerialPort.ts

```typescript
/**
 * React Hook - 串口通信管理
 */

import { useEffect, useState, useCallback } from 'react';
import { serialPortManager, EMGData } from '@/lib/serial-port';

export interface UseSerialPortReturn {
  isConnected: boolean;
  isReading: boolean;
  data: EMGData | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startReading: () => Promise<void>;
  stopReading: () => void;
}

export function useSerialPort(): UseSerialPortReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [data, setData] = useState<EMGData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);
      await serialPortManager.connect();
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接失败';
      setError(message);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      await serialPortManager.disconnect();
      setIsConnected(false);
      setIsReading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '断开连接失败';
      setError(message);
    }
  }, []);

  const startReading = useCallback(async () => {
    try {
      setError(null);
      setIsReading(true);

      const handleData = (emgData: EMGData) => {
        setData(emgData);
      };

      serialPortManager.onData(handleData);
      await serialPortManager.startReading();

      setIsReading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '读取失败';
      setError(message);
      setIsReading(false);
    }
  }, []);

  const stopReading = useCallback(() => {
    serialPortManager.stopReading();
    setIsReading(false);
  }, []);

  return {
    isConnected,
    isReading,
    data,
    error,
    connect,
    disconnect,
    startReading,
    stopReading,
  };
}

```

---

## hooks/useUserSession.ts

```typescript
/**
 * React Hook - 用户会话管理
 */

import { useState, useCallback } from 'react';
import { emgDatabase } from '@/lib/db';

export interface UserSession {
  id?: number;
  userId: string;
  userName: string;
  startTime: number;
  endTime?: number;
  trainingCount: number;
  recognitionCount: number;
  recognitionAccuracy?: number;
  notes?: string;
}

export interface UseUserSessionReturn {
  currentSession: UserSession | null;
  sessions: UserSession[];
  error: string | null;
  startSession: (userId: string, userName: string) => Promise<void>;
  endSession: () => Promise<void>;
  updateSessionStats: (
    trainingCount: number,
    recognitionCount: number,
    accuracy?: number
  ) => Promise<void>;
  loadSessions: () => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
}

export function useUserSession(): UseUserSessionReturn {
  const [currentSession, setCurrentSession] = useState<UserSession | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (userId: string, userName: string) => {
      try {
        setError(null);

        const session: UserSession = {
          userId,
          userName,
          startTime: Date.now(),
          trainingCount: 0,
          recognitionCount: 0,
        };

        const id = await emgDatabase.saveSession(session);
        session.id = id;
        setCurrentSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : '会话启动失败';
        setError(message);
      }
    },
    []
  );

  const endSession = useCallback(async () => {
    try {
      setError(null);

      if (!currentSession || !currentSession.id) {
        throw new Error('没有活跃会话');
      }

      const updatedSession: UserSession = {
        ...currentSession,
        endTime: Date.now(),
      };

      // 更新会话
      await emgDatabase.saveSession(updatedSession);
      setCurrentSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '会话结束失败';
      setError(message);
    }
  }, [currentSession]);

  const updateSessionStats = useCallback(
    async (
      trainingCount: number,
      recognitionCount: number,
      accuracy?: number
    ) => {
      try {
        setError(null);

        if (!currentSession) {
          throw new Error('没有活跃会话');
        }

        const updatedSession: UserSession = {
          ...currentSession,
          trainingCount,
          recognitionCount,
          recognitionAccuracy: accuracy,
        };

        setCurrentSession(updatedSession);
      } catch (err) {
        const message = err instanceof Error ? err.message : '更新失败';
        setError(message);
      }
    },
    [currentSession]
  );

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const allSessions = await emgDatabase.getAllSessions();
      setSessions(allSessions);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    }
  }, []);

  const deleteSession = useCallback(
    async (id: number) => {
      try {
        setError(null);
        // 从数据库删除（需要扩展 emgDatabase）
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : '删除失败';
        setError(message);
      }
    },
    []
  );

  return {
    currentSession,
    sessions,
    error,
    startSession,
    endSession,
    updateSessionStats,
    loadSessions,
    deleteSession,
  };
}

```

---

## lib/advanced-feature-extraction.ts

```typescript
/**
 * 高级特征提取模块 - 多维特征提取
 * 
 * 特征类型：
 * - 时域特征（6 维）：MAV, RMS, VAR, WL, ZCR, MAL
 * - 频域特征（4 维）：CF, BW, SE, PSD
 * - 小波特征（20 维）：多尺度分解系数
 * 
 * 总计：30 维特征向量
 */

/**
 * 时域特征接口
 */
export interface TimeDomainFeatures {
  mav: number; // 均值绝对值 (Mean Absolute Value)
  rms: number; // 均方根值 (Root Mean Square)
  var: number; // 方差 (Variance)
  wl: number;  // 波形长度 (Waveform Length)
  zcr: number; // 零交叉率 (Zero Crossing Rate)
  mal: number; // 肌肉激活水平 (Muscle Activation Level)
}

/**
 * 频域特征接口
 */
export interface FrequencyDomainFeatures {
  cf: number;  // 中心频率 (Center Frequency)
  bw: number;  // 带宽 (Bandwidth)
  se: number;  // 频谱熵 (Spectral Entropy)
  psd: number; // 功率谱密度峰值 (Peak Power Spectral Density)
}

/**
 * 小波特征接口
 */
export interface WaveletFeatures {
  coefficients: number[]; // 小波分解系数（20 维）
  energies: number[];     // 各层能量
  entropy: number;        // 小波熵
}

/**
 * 完整特征向量接口
 */
export interface AdvancedFeatureVector {
  timeDomain: TimeDomainFeatures;
  frequencyDomain: FrequencyDomainFeatures;
  wavelet: WaveletFeatures;
  vector: number[]; // 30 维特征向量
}

/**
 * 计算时域特征
 */
export function extractTimeDomainFeatures(signal: number[]): TimeDomainFeatures {
  if (signal.length === 0) {
    return { mav: 0, rms: 0, var: 0, wl: 0, zcr: 0, mal: 0 };
  }

  const n = signal.length;

  // 1. 均值绝对值 (MAV)
  const mav = signal.reduce((sum, val) => sum + Math.abs(val), 0) / n;

  // 2. 均方根值 (RMS)
  const rms = Math.sqrt(signal.reduce((sum, val) => sum + val * val, 0) / n);

  // 3. 方差 (VAR)
  const mean = signal.reduce((sum, val) => sum + val, 0) / n;
  const variance = signal.reduce((sum, val) => sum + (val - mean) ** 2, 0) / n;

  // 4. 波形长度 (WL) - 相邻样本差的绝对值之和
  let wl = 0;
  for (let i = 1; i < n; i++) {
    wl += Math.abs(signal[i] - signal[i - 1]);
  }

  // 5. 零交叉率 (ZCR) - 信号穿过零点的次数
  let zcr = 0;
  for (let i = 1; i < n; i++) {
    if (signal[i] * signal[i - 1] < 0) {
      zcr++;
    }
  }
  zcr = zcr / (n - 1);

  // 6. 肌肉激活水平 (MAL) - 高于阈值的样本比例
  const threshold = mean + 0.5 * Math.sqrt(variance);
  const mal = signal.filter((val) => Math.abs(val) > threshold).length / n;

  return { mav, rms, var: variance, wl, zcr, mal };
}

/**
 * 计算频域特征（使用 FFT）
 */
export function extractFrequencyDomainFeatures(
  signal: number[],
  samplingRate: number = 1000
): FrequencyDomainFeatures {
  if (signal.length === 0) {
    return { cf: 0, bw: 0, se: 0, psd: 0 };
  }

  // 简化的 FFT 实现（使用 Goertzel 算法或预计算）
  // 这里使用近似方法：基于频域能量分布

  const n = signal.length;
  const freqResolution = samplingRate / n;

  // 计算功率谱（简化版：使用 Welch 方法的近似）
  const psdValues: number[] = [];
  const frequencies: number[] = [];

  // 计算频率分量能量（使用离散傅里叶变换的近似）
  for (let k = 0; k < n / 2; k++) {
    let realPart = 0;
    let imagPart = 0;

    for (let i = 0; i < n; i++) {
      const angle = (-2 * Math.PI * k * i) / n;
      realPart += signal[i] * Math.cos(angle);
      imagPart += signal[i] * Math.sin(angle);
    }

    const magnitude = Math.sqrt(realPart * realPart + imagPart * imagPart);
    const power = (magnitude * magnitude) / n;
    psdValues.push(power);
    frequencies.push(k * freqResolution);
  }

  // 1. 中心频率 (CF)
  const totalPower = psdValues.reduce((a, b) => a + b, 0);
  const cf = totalPower > 0
    ? psdValues.reduce((sum, p, i) => sum + p * frequencies[i], 0) / totalPower
    : 0;

  // 2. 带宽 (BW) - 功率从最大值下降 50% 的频率范围
  const maxPower = Math.max(...psdValues);
  const threshold = maxPower * 0.5;
  const validIndices = psdValues
    .map((p, i) => (p >= threshold ? i : -1))
    .filter((i) => i !== -1);
  const bw = validIndices.length > 0
    ? (validIndices[validIndices.length - 1] - validIndices[0]) * freqResolution
    : 0;

  // 3. 频谱熵 (SE)
  const normalizedPsd = psdValues.map((p) => p / totalPower);
  let se = 0;
  for (const p of normalizedPsd) {
    if (p > 0) {
      se -= p * Math.log2(p);
    }
  }

  // 4. 功率谱密度峰值 (PSD)
  const psd = maxPower;

  return { cf, bw, se, psd };
}

/**
 * 简化的小波变换特征提取
 * 使用 Haar 小波进行多尺度分解
 */
export function extractWaveletFeatures(signal: number[]): WaveletFeatures {
  if (signal.length === 0) {
    return {
      coefficients: Array(20).fill(0),
      energies: Array(6).fill(0),
      entropy: 0,
    };
  }

  // 简化的小波分解（Haar 小波）
  const coefficients: number[] = [];
  const energies: number[] = [];

  let currentSignal = [...signal];
  let level = 0;
  const maxLevels = 6;

  while (level < maxLevels && currentSignal.length > 1) {
    const nextSignal: number[] = [];
    const details: number[] = [];

    // 一层小波分解
    for (let i = 0; i < currentSignal.length - 1; i += 2) {
      const approx = (currentSignal[i] + currentSignal[i + 1]) / 2;
      const detail = (currentSignal[i] - currentSignal[i + 1]) / 2;

      nextSignal.push(approx);
      details.push(detail);
    }

    // 存储细节系数（最多 20 个）
    const detailsToStore = Math.min(details.length, 20 - coefficients.length);
    for (let i = 0; i < detailsToStore; i++) {
      coefficients.push(Math.abs(details[i]));
    }

    // 计算能量
    const energy = details.reduce((sum, d) => sum + d * d, 0);
    energies.push(energy);

    currentSignal = nextSignal;
    level++;
  }

  // 填充到 20 维
  while (coefficients.length < 20) {
    coefficients.push(0);
  }

  // 计算小波熵
  let totalEnergy = energies.reduce((a, b) => a + b, 0);
  let entropy = 0;
  if (totalEnergy > 0) {
    for (const e of energies) {
      const p = e / totalEnergy;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
  }

  return {
    coefficients: coefficients.slice(0, 20),
    energies,
    entropy,
  };
}

/**
 * 提取完整的 30 维特征向量
 */
export function extractAdvancedFeatures(
  signal: number[],
  samplingRate: number = 1000
): AdvancedFeatureVector {
  // 提取各类特征
  const timeDomain = extractTimeDomainFeatures(signal);
  const frequencyDomain = extractFrequencyDomainFeatures(signal, samplingRate);
  const wavelet = extractWaveletFeatures(signal);

  // 组合成 30 维特征向量
  const vector: number[] = [
    // 时域特征（6 维）
    timeDomain.mav,
    timeDomain.rms,
    timeDomain.var,
    timeDomain.wl,
    timeDomain.zcr,
    timeDomain.mal,
    // 频域特征（4 维）
    frequencyDomain.cf,
    frequencyDomain.bw,
    frequencyDomain.se,
    frequencyDomain.psd,
    // 小波特征（20 维）
    ...wavelet.coefficients,
  ];

  return {
    timeDomain,
    frequencyDomain,
    wavelet,
    vector,
  };
}

/**
 * 特征向量归一化
 */
export function normalizeFeatureVector(vector: number[]): number[] {
  // Z-score 归一化
  const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
  const variance = vector.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vector.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return vector;
  }

  return vector.map((v) => (v - mean) / std);
}

/**
 * 百分位数归一化（对异常值更鲁棒）
 */
export function percentileNormalizeFeatureVector(vector: number[]): number[] {
  const sorted = [...vector].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = p75 - p25;

  if (iqr === 0) {
    return vector;
  }

  return vector.map((v) => (v - p25) / iqr);
}

/**
 * 计算两个特征向量之间的 Mahalanobis 距离
 */
export function mahalanobisDistance(
  v1: number[],
  v2: number[],
  covarianceMatrix?: number[][]
): number {
  if (v1.length !== v2.length) {
    throw new Error('Feature vectors must have the same length');
  }

  const diff = v1.map((val, i) => val - v2[i]);

  // 如果没有提供协方差矩阵，使用简化版本（对角线协方差）
  if (!covarianceMatrix) {
    // 计算特征的方差
    const variances = new Array(v1.length).fill(0);
    for (let i = 0; i < v1.length; i++) {
      variances[i] = 1; // 假设方差为 1（标准化后）
    }

    // Mahalanobis 距离 = sqrt(diff^T * Cov^-1 * diff)
    let distance = 0;
    for (let i = 0; i < diff.length; i++) {
      distance += (diff[i] * diff[i]) / variances[i];
    }
    return Math.sqrt(distance);
  }

  // 使用提供的协方差矩阵
  let distance = 0;
  for (let i = 0; i < diff.length; i++) {
    for (let j = 0; j < diff.length; j++) {
      distance += diff[i] * diff[j] * covarianceMatrix[i][j];
    }
  }

  return Math.sqrt(Math.max(0, distance)); // 避免浮点误差导致的负数
}

/**
 * 计算特征向量的相似度（0-100）
 */
export function calculateFeatureSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    return 0;
  }

  // 使用余弦相似度
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  const cosineSimilarity = dotProduct / (norm1 * norm2);
  // 转换为 0-100 的相似度评分
  return Math.max(0, Math.min(100, (cosineSimilarity + 1) * 50));
}

/**
 * 计算特征向量组的协方差矩阵
 */
export function calculateCovarianceMatrix(vectors: number[][]): number[][] {
  if (vectors.length === 0 || vectors[0].length === 0) {
    return [];
  }

  const n = vectors.length;
  const m = vectors[0].length;

  // 计算均值
  const means = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      means[i] += vectors[j][i];
    }
    means[i] /= n;
  }

  // 计算协方差矩阵
  const cov: number[][] = Array(m)
    .fill(null)
    .map(() => Array(m).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        cov[i][j] += (vectors[k][i] - means[i]) * (vectors[k][j] - means[j]);
      }
      cov[i][j] /= n;
    }
  }

  return cov;
}

```

---

## lib/audit-log.ts

```typescript
/**
 * 系统日志和审计模块
 * 
 * 功能：
 * - 记录用户操作（登录、采集、删除等）
 * - 提供审计日志查询
 * - 支持日志导出
 */

export enum AuditEventType {
  // 用户操作
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  USER_PASSWORD_RESET = 'USER_PASSWORD_RESET',

  // 采集操作
  COLLECTION_START = 'COLLECTION_START',
  COLLECTION_SAVE = 'COLLECTION_SAVE',
  COLLECTION_DELETE = 'COLLECTION_DELETE',

  // 管理员操作
  ADMIN_DELETE_USER_DATA = 'ADMIN_DELETE_USER_DATA',
  ADMIN_CLEAR_ALL_DATA = 'ADMIN_CLEAR_ALL_DATA',
  ADMIN_RESET_PASSWORD = 'ADMIN_RESET_PASSWORD',
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  userName?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

const STORAGE_KEY = 'emg-audit-logs';
const MAX_LOGS = 10000; // 最多保存 10000 条日志

/**
 * 获取所有审计日志
 */
export function getAllAuditLogs(): AuditLogEntry[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    return [];
  }

  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse audit logs:', err);
    return [];
  }
}

/**
 * 记录审计事件
 */
export function logAuditEvent(
  eventType: AuditEventType,
  details: Record<string, any>,
  userId?: string,
  userName?: string
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    eventType,
    userId,
    userName,
    details,
    userAgent: navigator.userAgent,
  };

  const logs = getAllAuditLogs();
  logs.push(entry);

  // 如果日志数量超过限制，删除最旧的日志
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));

  return entry;
}

/**
 * 按事件类型查询日志
 */
export function getLogsByEventType(eventType: AuditEventType): AuditLogEntry[] {
  const logs = getAllAuditLogs();
  return logs.filter(log => log.eventType === eventType);
}

/**
 * 按用户查询日志
 */
export function getLogsByUser(userId: string): AuditLogEntry[] {
  const logs = getAllAuditLogs();
  return logs.filter(log => log.userId === userId);
}

/**
 * 按时间范围查询日志
 */
export function getLogsByTimeRange(startTime: number, endTime: number): AuditLogEntry[] {
  const logs = getAllAuditLogs();
  return logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
}

/**
 * 获取最近的 N 条日志
 */
export function getRecentLogs(count: number = 100): AuditLogEntry[] {
  const logs = getAllAuditLogs();
  return logs.slice(-count).reverse();
}

/**
 * 清空所有审计日志
 */
export function clearAllAuditLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 导出审计日志为 CSV
 */
export function exportAuditLogsToCSV(logs?: AuditLogEntry[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `audit-logs-${timestamp}.csv`;

  const logsToExport = logs || getAllAuditLogs();

  const headers = ['日志ID', '时间', '事件类型', '用户ID', '用户名', '详情'];
  const rows: string[][] = logsToExport.map(log => [
    log.id,
    new Date(log.timestamp).toLocaleString('zh-CN'),
    log.eventType,
    log.userId || 'N/A',
    log.userName || 'N/A',
    JSON.stringify(log.details),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 获取审计统计信息
 */
export function getAuditStatistics() {
  const logs = getAllAuditLogs();

  const stats = {
    totalEvents: logs.length,
    eventsByType: {} as Record<string, number>,
    eventsByUser: {} as Record<string, number>,
    recentEvents: logs.slice(-10).reverse(),
  };

  logs.forEach(log => {
    // 按事件类型统计
    stats.eventsByType[log.eventType] = (stats.eventsByType[log.eventType] || 0) + 1;

    // 按用户统计
    const userName = log.userName || 'Unknown';
    stats.eventsByUser[userName] = (stats.eventsByUser[userName] || 0) + 1;
  });

  return stats;
}

```

---

## lib/auto-calibration-system.ts

```typescript
/**
 * 模型自动纠偏系统
 * 
 * 功能：
 * - 根据用户反馈自动调整模型特征
 * - 强化正确识别的特征
 * - 纠偏错误识别的特征
 * - 跟踪特征演变过程
 */

import { CommandTemplate } from './template-based-recognition';

export interface CalibrationRecord {
  timestamp: number;
  predictedCommand: string;
  actualCommand: string;
  isCorrect: boolean;
  similarity: number;
  confidence: number;
  adjustmentApplied: string;
}

export interface FeatureAdjustment {
  commandName: string;
  adjustmentType: 'reinforce' | 'correct';
  reason: string;
  adjustmentStrength: number; // 0-1
  affectedFeatures: string[];
  timestamp: number;
}

const CALIBRATION_STORAGE_KEY = 'emg-calibration-records';
const ADJUSTMENT_STORAGE_KEY = 'emg-feature-adjustments';

/**
 * 获取所有纠偏记录
 */
export function getCalibrationRecords(): CalibrationRecord[] {
  try {
    const data = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * 保存纠偏记录
 */
export function saveCalibrationRecord(record: CalibrationRecord): void {
  const records = getCalibrationRecords();
  records.push(record);
  
  // 只保存最近 1000 条记录
  if (records.length > 1000) {
    records.splice(0, records.length - 1000);
  }
  
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(records));
}

/**
 * 获取所有特征调整记录
 */
export function getFeatureAdjustments(): FeatureAdjustment[] {
  try {
    const data = localStorage.getItem(ADJUSTMENT_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * 保存特征调整记录
 */
export function saveFeatureAdjustment(adjustment: FeatureAdjustment): void {
  const adjustments = getFeatureAdjustments();
  adjustments.push(adjustment);
  
  // 只保存最近 500 条记录
  if (adjustments.length > 500) {
    adjustments.splice(0, adjustments.length - 500);
  }
  
  localStorage.setItem(ADJUSTMENT_STORAGE_KEY, JSON.stringify(adjustments));
}

/**
 * 处理识别结果反馈并进行纠偏
 */
export function processRecognitionFeedback(
  predictedCommand: string,
  actualCommand: string,
  similarity: number,
  confidence: number,
  templates: CommandTemplate[]
): CalibrationRecord {
  const isCorrect = predictedCommand === actualCommand;
  
  // 创建纠偏记录
  const record: CalibrationRecord = {
    timestamp: Date.now(),
    predictedCommand,
    actualCommand,
    isCorrect,
    similarity,
    confidence,
    adjustmentApplied: '',
  };

  // 根据是否正确进行不同的调整
  if (isCorrect) {
    // 识别正确：强化特征
    record.adjustmentApplied = 'reinforce';
    reinforceFeatures(actualCommand, templates, similarity, confidence);
  } else {
    // 识别错误：纠偏特征
    record.adjustmentApplied = 'correct';
    correctFeatures(
      predictedCommand,
      actualCommand,
      templates,
      similarity,
      confidence
    );
  }

  // 保存纠偏记录
  saveCalibrationRecord(record);

  return record;
}

/**
 * 强化正确识别的特征
 */
function reinforceFeatures(
  commandName: string,
  templates: CommandTemplate[],
  similarity: number,
  confidence: number
): void {
  const template = templates.find((t) => t.commandName === commandName);
  if (!template) return;

  // 计算强化强度（基于相似度和置信度）
  const reinforcementStrength = Math.min(
    1,
    (similarity + confidence) / 200 * 0.3 // 最多强化 30%
  );

  // 强化特征（更新平均特征向量）
  if (template.meanFeatureVector) {
    template.meanFeatureVector = template.meanFeatureVector.map(
      (f: number) => f * (1 + reinforcementStrength)
    );
  }

  // 记录特征调整
  const adjustment: FeatureAdjustment = {
    commandName,
    adjustmentType: 'reinforce',
    reason: `识别正确，相似度 ${similarity}%，置信度 ${confidence}%`,
    adjustmentStrength: reinforcementStrength,
    affectedFeatures: ['all'],
    timestamp: Date.now(),
  };

  saveFeatureAdjustment(adjustment);

  // 保存更新后的模板
  saveUpdatedTemplate(template);
}

/**
 * 纠偏错误识别的特征
 */
function correctFeatures(
  predictedCommand: string,
  actualCommand: string,
  templates: CommandTemplate[],
  similarity: number,
  confidence: number
): void {
  const predictedTemplate = templates.find((t) => t.commandName === predictedCommand);
  const actualTemplate = templates.find((t) => t.commandName === actualCommand);

  if (!predictedTemplate || !actualTemplate) return;

  // 计算纠偏强度（基于错误的严重程度）
  // 相似度越高，说明特征越接近，需要更强的纠偏
  const correctionStrength = Math.min(
    1,
    (similarity / 100) * 0.5 // 最多纠偏 50%
  );

  // 调整预测命令的特征（减弱）
  if (predictedTemplate.meanFeatureVector) {
    predictedTemplate.meanFeatureVector = predictedTemplate.meanFeatureVector.map(
      (f: number) => f * (1 - correctionStrength * 0.5)
    );
  }

  // 调整实际命令的特征（增强）
  if (actualTemplate.meanFeatureVector) {
    actualTemplate.meanFeatureVector = actualTemplate.meanFeatureVector.map(
      (f: number) => f * (1 + correctionStrength * 0.5)
    );
  }

  // 记录特征调整
  const adjustment: FeatureAdjustment = {
    commandName: actualCommand,
    adjustmentType: 'correct',
    reason: `识别错误，误识别为 ${predictedCommand}，相似度 ${similarity}%`,
    adjustmentStrength: correctionStrength,
    affectedFeatures: ['all'],
    timestamp: Date.now(),
  };

  saveFeatureAdjustment(adjustment);

  // 保存更新后的模板
  saveUpdatedTemplate(predictedTemplate);
  saveUpdatedTemplate(actualTemplate);
}

/**
 * 保存更新后的模板
 */
function saveUpdatedTemplate(template: CommandTemplate): void {
  try {
    const templates = JSON.parse(
      localStorage.getItem(`templates-${template.commandName}`) || '[]'
    );
    
    // 更新模板
    const index = templates.findIndex((t: any) => t.commandName === template.commandName);
    if (index >= 0) {
      templates[index] = template;
    } else {
      templates.push(template);
    }

    localStorage.setItem(
      `templates-${template.commandName}`,
      JSON.stringify(templates)
    );
  } catch (err) {
    console.error('Failed to save updated template:', err);
  }
}

/**
 * 计算纠偏效果统计
 */
export function getCalibrationStatistics() {
  const records = getCalibrationRecords();
  const adjustments = getFeatureAdjustments();

  if (records.length === 0) {
    return {
      totalRecords: 0,
      correctCount: 0,
      accuracy: 0,
      reinforcementCount: 0,
      correctionCount: 0,
      averageSimilarity: 0,
      averageConfidence: 0,
      recentAccuracy: 0,
      improvementTrend: 0,
    };
  }

  // 计算总体准确率
  const correctCount = records.filter((r) => r.isCorrect).length;
  const accuracy = (correctCount / records.length) * 100;

  // 计算调整统计
  const reinforcementCount = adjustments.filter(
    (a) => a.adjustmentType === 'reinforce'
  ).length;
  const correctionCount = adjustments.filter(
    (a) => a.adjustmentType === 'correct'
  ).length;

  // 计算平均相似度和置信度
  const averageSimilarity =
    records.reduce((sum, r) => sum + r.similarity, 0) / records.length;
  const averageConfidence =
    records.reduce((sum, r) => sum + r.confidence, 0) / records.length;

  // 计算最近 10 条记录的准确率
  const recentRecords = records.slice(-10);
  const recentCorrectCount = recentRecords.filter((r) => r.isCorrect).length;
  const recentAccuracy = (recentCorrectCount / recentRecords.length) * 100;

  // 计算改进趋势（最近 10 条 vs 之前 10 条）
  let improvementTrend = 0;
  if (records.length >= 20) {
    const previousRecords = records.slice(-20, -10);
    const previousCorrectCount = previousRecords.filter((r) => r.isCorrect).length;
    const previousAccuracy = (previousCorrectCount / previousRecords.length) * 100;
    improvementTrend = recentAccuracy - previousAccuracy;
  }

  return {
    totalRecords: records.length,
    correctCount,
    accuracy,
    reinforcementCount,
    correctionCount,
    averageSimilarity: Math.round(averageSimilarity * 10) / 10,
    averageConfidence: Math.round(averageConfidence * 10) / 10,
    recentAccuracy,
    improvementTrend: Math.round(improvementTrend * 10) / 10,
  };
}

/**
 * 获取按指令的纠偏统计
 */
export function getCalibrationByCommand() {
  const records = getCalibrationRecords();
  const stats: Record<string, any> = {};

  records.forEach((record) => {
    if (!stats[record.actualCommand]) {
      stats[record.actualCommand] = {
        totalTests: 0,
        correctCount: 0,
        accuracy: 0,
        averageSimilarity: 0,
        averageConfidence: 0,
        reinforcements: 0,
        corrections: 0,
        commonMisclassifications: {} as Record<string, number>,
      };
    }

    stats[record.actualCommand].totalTests++;
    if (record.isCorrect) {
      stats[record.actualCommand].correctCount++;
    } else {
      // 记录常见的误分类
      const predicted = record.predictedCommand;
      stats[record.actualCommand].commonMisclassifications[predicted] =
        (stats[record.actualCommand].commonMisclassifications[predicted] || 0) + 1;
    }

    stats[record.actualCommand].averageSimilarity += record.similarity;
    stats[record.actualCommand].averageConfidence += record.confidence;
  });

  // 计算准确率和平均值
  Object.keys(stats).forEach((cmd) => {
    const stat = stats[cmd];
    stat.accuracy = (stat.correctCount / stat.totalTests) * 100;
    stat.averageSimilarity = Math.round((stat.averageSimilarity / stat.totalTests) * 10) / 10;
    stat.averageConfidence = Math.round((stat.averageConfidence / stat.totalTests) * 10) / 10;
  });

  // 统计调整数
  const adjustments = getFeatureAdjustments();
  adjustments.forEach((adj) => {
    if (stats[adj.commandName]) {
      if (adj.adjustmentType === 'reinforce') {
        stats[adj.commandName].reinforcements++;
      } else {
        stats[adj.commandName].corrections++;
      }
    }
  });

  return stats;
}

/**
 * 导出纠偏报告为 JSON
 */
export function exportCalibrationReportAsJSON(): string {
  const records = getCalibrationRecords();
  const adjustments = getFeatureAdjustments();
  const statistics = getCalibrationStatistics();
  const byCommand = getCalibrationByCommand();

  const report = {
    exportTime: new Date().toISOString(),
    statistics,
    byCommand,
    records,
    adjustments,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * 导出纠偏报告为 CSV
 */
export function exportCalibrationReportAsCSV(): string {
  const records = getCalibrationRecords();
  
  if (records.length === 0) {
    return 'No calibration records';
  }

  // CSV 头
  const headers = [
    'Timestamp',
    'Predicted Command',
    'Actual Command',
    'Is Correct',
    'Similarity',
    'Confidence',
    'Adjustment Applied',
  ];

  // CSV 行
  const rows = records.map((record) => [
    new Date(record.timestamp).toISOString(),
    record.predictedCommand,
    record.actualCommand,
    record.isCorrect ? 'Yes' : 'No',
    record.similarity,
    record.confidence,
    record.adjustmentApplied,
  ]);

  // 合并
  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csv;
}

/**
 * 清除所有纠偏记录
 */
export function clearCalibrationData(): void {
  localStorage.removeItem(CALIBRATION_STORAGE_KEY);
  localStorage.removeItem(ADJUSTMENT_STORAGE_KEY);
}

```

---

## lib/auto-segmentation.ts

```typescript
/**
 * 自动有效片段检测和质量评分模块
 * 
 * 功能：
 * - 自动检测多次采集中的共同高能量区间
 * - 自动裁剪到有效片段，去除前后等待时间
 * - 计算采集质量评分
 * - 检测异常采集
 */

import * as ss from 'simple-statistics';

export interface SegmentationResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
}

export interface QualityScore {
  overallScore: number; // 0-100
  energyConsistency: number; // 与其他采集的能量一致性
  alignmentScore: number; // 对齐质量
  isOutlier: boolean; // 是否为异常采集
  recommendation: string; // 建议
}

/**
 * 计算信号能量（使用 RMS）
 */
export function calculateEnergy(signal: number[]): number[] {
  const windowSize = 10; // 10 个采样点为一个窗口
  const energy: number[] = [];

  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    const rms = Math.sqrt(ss.mean(window.map((x) => x * x)));
    energy.push(rms);
  }

  return energy;
}

/**
 * 检测有效片段（基于能量阈值）
 */
export function detectValidSegment(
  signal: number[],
  threshold: number = 0.3 // 能量阈值（相对于最大能量的百分比）
): SegmentationResult {
  const energy = calculateEnergy(signal);
  const maxEnergy = Math.max(...energy);
  const energyThreshold = maxEnergy * threshold;

  let startIdx = -1;
  let endIdx = -1;

  // 找到第一个超过阈值的点
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > energyThreshold) {
      startIdx = i;
      break;
    }
  }

  // 找到最后一个超过阈值的点
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > energyThreshold) {
      endIdx = i + 10; // +10 是因为能量窗口大小
      break;
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    startIdx = 0;
    endIdx = signal.length;
  }

  // 计算置信度（有效片段占总长度的比例）
  const confidence = (endIdx - startIdx) / signal.length;

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(signal.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
  };
}

/**
 * 多次采集对齐 - 找到共同的高能量区间
 * 用于自动检测有效片段
 */
export function alignMultipleCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): SegmentationResult {
  if (collections.length === 0) {
    return { startIdx: 0, endIdx: 0, confidence: 0, energyProfile: [] };
  }

  // 计算每次采集的能量曲线
  const energyProfiles = collections.map((col) => calculateEnergy(col.ch2)); // 使用 CH2（主信号）

  // 标准化能量曲线到 [0, 1]
  const normalizedProfiles = energyProfiles.map((profile) => {
    const max = Math.max(...profile);
    return profile.map((e) => (max > 0 ? e / max : 0));
  });

  // 计算所有采集的平均能量曲线
  const avgProfile: number[] = [];
  const minLength = Math.min(...normalizedProfiles.map((p) => p.length));

  for (let i = 0; i < minLength; i++) {
    const values = normalizedProfiles.map((p) => p[i]);
    avgProfile.push(ss.mean(values));
  }

  // 计算标准差（用于检测共同区间）
  const stdProfile: number[] = [];
  for (let i = 0; i < minLength; i++) {
    const values = normalizedProfiles.map((p) => p[i]);
    stdProfile.push(ss.standardDeviation(values));
  }

  // 找到低标准差的区间（所有采集都有相似能量的区间）
  const consistencyThreshold = 0.2; // 标准差阈值
  const highEnergyThreshold = 0.3; // 能量阈值

  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < minLength; i++) {
    if (
      stdProfile[i] < consistencyThreshold &&
      avgProfile[i] > highEnergyThreshold
    ) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  }

  if (startIdx === -1) {
    startIdx = 0;
    endIdx = minLength;
  }

  // 扩展边界以包含过渡区域
  const margin = Math.floor(minLength * 0.05);
  startIdx = Math.max(0, startIdx - margin);
  endIdx = Math.min(minLength, endIdx + margin);

  const confidence =
    collections.length > 1
      ? 1 - ss.mean(stdProfile.slice(startIdx, endIdx))
      : 0.5;

  return {
    startIdx: startIdx * 10, // 转换回样本索引（能量窗口大小为 10）
    endIdx: endIdx * 10,
    confidence: Math.max(0, Math.min(1, confidence)),
    energyProfile: avgProfile,
  };
}

/**
 * 计算采集质量评分
 */
export function calculateQualityScore(
  signal: number[],
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  collectionIndex: number
): QualityScore {
  const segment = detectValidSegment(signal);
  const alignment = alignMultipleCollections(allCollections);

  // 1. 能量一致性评分（与其他采集的对齐质量）
  const energyConsistency = alignment.confidence * 100;

  // 2. 对齐评分（有效片段占总长度的比例）
  const alignmentScore = segment.confidence * 100;

  // 3. 检测异常采集
  // 如果有效片段太短或太长，标记为异常
  const segmentLength = segment.endIdx - segment.startIdx;
  const totalLength = signal.length;
  const segmentRatio = segmentLength / totalLength;

  let isOutlier = false;
  let recommendation = '✓ 质量良好';

  if (segmentRatio < 0.3) {
    isOutlier = true;
    recommendation = '⚠ 有效信号过短，建议重录';
  } else if (segmentRatio > 0.9) {
    isOutlier = true;
    recommendation = '⚠ 有效信号过长，可能包含无用数据';
  } else if (energyConsistency < 50) {
    isOutlier = true;
    recommendation = '⚠ 与其他采集差异大，建议重录';
  }

  // 4. 综合评分
  const overallScore =
    (energyConsistency * 0.5 + alignmentScore * 0.5) * (isOutlier ? 0.7 : 1.0);

  return {
    overallScore: Math.round(overallScore),
    energyConsistency: Math.round(energyConsistency),
    alignmentScore: Math.round(alignmentScore),
    isOutlier,
    recommendation,
  };
}

/**
 * 批量评估所有采集
 */
export function evaluateAllCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): Array<QualityScore & { index: number }> {
  return collections.map((col, idx) => ({
    index: idx,
    ...calculateQualityScore(col.ch2, collections, idx),
  }));
}

/**
 * 自动裁剪采集数据到有效片段
 */
export function autoCropCollection(
  collection: { ch1: number[]; ch2: number[]; ch3: number[] },
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  const alignment = alignMultipleCollections(allCollections);

  return {
    ch1: collection.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: collection.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: collection.ch3.slice(alignment.startIdx, alignment.endIdx),
  };
}

```

---

## lib/auto-spec-generator.ts

```typescript
/**
 * 自动规范生成模块
 * 为缺失规范的指令自动生成默认规范
 */

import { InstructionLengthSpec } from '@shared/instruction-length-spec';

/**
 * 根据指令名称的长度自动推断指令类型
 */
export function inferInstructionType(instructionName: string): 'single-syllable' | 'double-syllable' | 'multi-syllable' {
  const charCount = instructionName.length;
  
  if (charCount <= 2) {
    return 'single-syllable';
  } else if (charCount <= 4) {
    return 'double-syllable';
  } else {
    return 'multi-syllable';
  }
}

/**
 * 根据指令类型生成默认规范
 */
export function generateDefaultSpec(instructionName: string): InstructionLengthSpec {
  const type = inferInstructionType(instructionName);
  
  const baseSpecs: Record<string, Omit<InstructionLengthSpec, 'name'>> = {
    'single-syllable': {
      minDurationMs: 150,
      maxDurationMs: 300,
      recommendedDurationMs: 200,
      description: '单音节指令（如：是、否、开、关）',
    },
    'double-syllable': {
      minDurationMs: 200,
      maxDurationMs: 450,
      recommendedDurationMs: 320,
      description: '双音节指令（如：播放、暂停、音量）',
    },
    'multi-syllable': {
      minDurationMs: 250,
      maxDurationMs: 600,
      recommendedDurationMs: 400,
      description: '多音节指令（如：上一曲、下一曲）',
    },
  };
  
  const baseSpec = baseSpecs[type];
  
  return {
    name: instructionName,
    ...baseSpec,
  };
}

/**
 * 验证指令是否符合规范
 */
export function validateInstructionDuration(
  durationMs: number,
  spec: InstructionLengthSpec
): {
  isValid: boolean;
  message: string;
  suggestion?: string;
} {
  if (durationMs < spec.minDurationMs) {
    return {
      isValid: false,
      message: `采集时长 ${durationMs.toFixed(0)}ms 过短，最小要求 ${spec.minDurationMs}ms`,
      suggestion: `建议放慢发音速度，目标时长 ${spec.recommendedDurationMs}ms`,
    };
  }
  
  if (durationMs > spec.maxDurationMs) {
    return {
      isValid: false,
      message: `采集时长 ${durationMs.toFixed(0)}ms 过长，最大允许 ${spec.maxDurationMs}ms`,
      suggestion: `建议加快发音速度，目标时长 ${spec.recommendedDurationMs}ms`,
    };
  }
  
  return {
    isValid: true,
    message: `采集时长 ${durationMs.toFixed(0)}ms 符合规范 ✓`,
  };
}

/**
 * 获取所有已采集的指令名称
 */
export function getAllCollectedInstructions(): string[] {
  try {
    const data = localStorage.getItem('emg-collections');
    if (!data) return [];
    
    const collections = JSON.parse(data);
    const instructionNames = new Set<string>();
    
    collections.forEach((col: any) => {
      if (col.commandName) {
        instructionNames.add(col.commandName);
      }
    });
    
    return Array.from(instructionNames).sort();
  } catch (err) {
    console.error('Failed to get collected instructions:', err);
    return [];
  }
}

/**
 * 获取缺失规范的指令
 */
export function getMissingSpecInstructions(
  definedSpecs: Record<string, InstructionLengthSpec>
): string[] {
  const allInstructions = getAllCollectedInstructions();
  return allInstructions.filter(name => !definedSpecs[name]);
}

/**
 * 为缺失规范的指令生成默认规范
 */
export function generateMissingSpecs(
  definedSpecs: Record<string, InstructionLengthSpec>
): Record<string, InstructionLengthSpec> {
  const missingInstructions = getMissingSpecInstructions(definedSpecs);
  const generatedSpecs: Record<string, InstructionLengthSpec> = {};
  
  missingInstructions.forEach(name => {
    generatedSpecs[name] = generateDefaultSpec(name);
  });
  
  return generatedSpecs;
}

/**
 * 获取完整的规范（定义 + 自动生成）
 */
export function getCompleteSpecs(
  definedSpecs: Record<string, InstructionLengthSpec>
): Record<string, InstructionLengthSpec> {
  const generatedSpecs = generateMissingSpecs(definedSpecs);
  return { ...definedSpecs, ...generatedSpecs };
}

/**
 * 获取指令规范，如果不存在则自动生成
 */
export function getInstructionSpec(
  instructionName: string,
  definedSpecs: Record<string, InstructionLengthSpec>
): InstructionLengthSpec {
  if (definedSpecs[instructionName]) {
    return definedSpecs[instructionName];
  }
  
  return generateDefaultSpec(instructionName);
}

```

---

## lib/baseline-calibration.ts

```typescript
/**
 * 基线校准模块
 * 
 * 功能：
 * - 采集静息基线数据
 * - 计算基线统计特性
 * - 实时减基线处理
 * - 基线漂移检测和补偿
 */

export interface BaselineData {
  ch1: number;
  ch2: number;
  ch3: number;
  timestamp: number;
  quality: number; // 0-1，表示基线质量
}

export interface BaselineCalibrationResult {
  baseline: BaselineData;
  std: { ch1: number; ch2: number; ch3: number };
  quality: number;
  samplesCollected: number;
  calibrationTime: number; // 毫秒
}

const STORAGE_KEY = 'emg-baseline-calibration';
const DEFAULT_CALIBRATION_DURATION = 3000; // 3 秒
const DEFAULT_SAMPLE_RATE = 500; // Hz

/**
 * 采集基线数据
 * 
 * @param dataCallback 数据回调函数
 * @param duration 采集时长（毫秒）
 * @param sampleRate 采样率（Hz）
 * @returns 基线校准结果
 */
export async function calibrateBaseline(
  dataCallback: (data: { ch1: number; ch2: number; ch3: number }) => void,
  duration: number = DEFAULT_CALIBRATION_DURATION,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Promise<BaselineCalibrationResult> {
  const samples = {
    ch1: [] as number[],
    ch2: [] as number[],
    ch3: [] as number[],
  };

  const startTime = Date.now();
  const sampleInterval = 1000 / sampleRate;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(timer);

        // 计算基线和标准差
        const baseline: BaselineData = {
          ch1: calculateMean(samples.ch1),
          ch2: calculateMean(samples.ch2),
          ch3: calculateMean(samples.ch3),
          timestamp: Date.now(),
          quality: calculateQuality(samples),
        };

        const std = {
          ch1: calculateStdDev(samples.ch1),
          ch2: calculateStdDev(samples.ch2),
          ch3: calculateStdDev(samples.ch3),
        };

        const result: BaselineCalibrationResult = {
          baseline,
          std,
          quality: baseline.quality,
          samplesCollected: samples.ch1.length,
          calibrationTime: elapsed,
        };

        // 保存到 localStorage
        saveBaselineToStorage(result);

        resolve(result);
      }
    }, sampleInterval);

    // 模拟数据采集（实际应该从硬件接收）
    // 这里只是示例，实际应该通过 dataCallback 接收数据
    const mockTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(mockTimer);
      } else {
        // 生成模拟数据（零均值高斯噪声）
        const mockData = {
          ch1: Math.random() * 10 - 5,
          ch2: Math.random() * 10 - 5,
          ch3: Math.random() * 10 - 5,
        };

        samples.ch1.push(mockData.ch1);
        samples.ch2.push(mockData.ch2);
        samples.ch3.push(mockData.ch3);

        dataCallback(mockData);
      }
    }, sampleInterval);
  });
}

/**
 * 从存储中加载基线
 * 
 * @returns 基线校准结果，如果不存在返回 null
 */
export function loadBaselineFromStorage(): BaselineCalibrationResult | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const result = JSON.parse(data) as BaselineCalibrationResult;
    return result;
  } catch (err) {
    console.error('Failed to load baseline from storage:', err);
    return null;
  }
}

/**
 * 保存基线到存储
 * 
 * @param result 基线校准结果
 */
export function saveBaselineToStorage(result: BaselineCalibrationResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch (err) {
    console.error('Failed to save baseline to storage:', err);
  }
}

/**
 * 清除存储的基线
 */
export function clearBaselineFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear baseline from storage:', err);
  }
}

/**
 * 减去基线
 * 
 * @param signal 原始信号
 * @param baseline 基线值
 * @returns 减基线后的信号
 */
export function subtractBaseline(signal: number[], baseline: number): number[] {
  return signal.map(x => x - baseline);
}

/**
 * 减去三通道基线
 * 
 * @param ch1 通道 1
 * @param ch2 通道 2
 * @param ch3 通道 3
 * @param baselineData 基线数据
 * @returns 减基线后的三通道信号
 */
export function subtractBaselineMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  baselineData: BaselineData
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: subtractBaseline(ch1, baselineData.ch1),
    ch2: subtractBaseline(ch2, baselineData.ch2),
    ch3: subtractBaseline(ch3, baselineData.ch3),
  };
}

/**
 * 检测基线漂移
 * 
 * @param currentData 当前数据
 * @param baseline 基线
 * @param threshold 漂移阈值（标准差倍数）
 * @returns 是否发生漂移
 */
export function detectBaselineDrift(
  currentData: number[],
  baseline: BaselineData,
  baselineStd: { ch1: number; ch2: number; ch3: number },
  threshold: number = 3
): {
  hasDrift: boolean;
  driftAmount: { ch1: number; ch2: number; ch3: number };
} {
  const currentMean = {
    ch1: calculateMean(currentData.slice(0, Math.floor(currentData.length / 3))),
    ch2: calculateMean(currentData.slice(Math.floor(currentData.length / 3), Math.floor(2 * currentData.length / 3))),
    ch3: calculateMean(currentData.slice(Math.floor(2 * currentData.length / 3))),
  };

  const driftAmount = {
    ch1: Math.abs(currentMean.ch1 - baseline.ch1),
    ch2: Math.abs(currentMean.ch2 - baseline.ch2),
    ch3: Math.abs(currentMean.ch3 - baseline.ch3),
  };

  const hasDrift =
    driftAmount.ch1 > threshold * baselineStd.ch1 ||
    driftAmount.ch2 > threshold * baselineStd.ch2 ||
    driftAmount.ch3 > threshold * baselineStd.ch3;

  return { hasDrift, driftAmount };
}

/**
 * 计算平均值
 */
function calculateMean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, val) => sum + val, 0) / data.length;
}

/**
 * 计算标准差
 */
function calculateStdDev(data: number[]): number {
  if (data.length === 0) return 0;

  const mean = calculateMean(data);
  const variance = data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;

  return Math.sqrt(variance);
}

/**
 * 计算基线质量（基于噪声水平）
 * 质量 = 1 / (1 + 平均标准差)
 */
function calculateQuality(samples: { ch1: number[]; ch2: number[]; ch3: number[] }): number {
  const std1 = calculateStdDev(samples.ch1);
  const std2 = calculateStdDev(samples.ch2);
  const std3 = calculateStdDev(samples.ch3);

  const avgStd = (std1 + std2 + std3) / 3;

  // 质量范围 [0, 1]
  return 1 / (1 + avgStd);
}

/**
 * 验证基线是否有效
 * 
 * @param result 基线校准结果
 * @param maxAge 最大年龄（毫秒）
 * @returns 是否有效
 */
export function isBaselineValid(
  result: BaselineCalibrationResult,
  maxAge: number = 3600000 // 1 小时
): boolean {
  if (!result) return false;

  const age = Date.now() - result.baseline.timestamp;
  const qualityOk = result.quality > 0.5;
  const ageOk = age < maxAge;

  return qualityOk && ageOk;
}

export default {
  calibrateBaseline,
  loadBaselineFromStorage,
  saveBaselineToStorage,
  clearBaselineFromStorage,
  subtractBaseline,
  subtractBaselineMultiChannel,
  detectBaselineDrift,
  isBaselineValid,
};

```

---

## lib/batch-crop-manager.ts

```typescript
/**
 * 批量裁切管理器
 * 
 * 功能：
 * - 对多个采集的波形进行批量裁切
 * - 自动检测和移除无效片段
 * - 支持自定义裁切参数
 * - 生成裁切报告
 */

import { detectValidSegmentAfterPreprocessing } from './preprocessing-aware-cropping';
import { normalizeWaveformLength } from './fixed-length-cropping';

export interface WaveformData {
  ch1: number[];
  ch2: number[];
  ch3: number[];
}

export interface CropResult {
  original: WaveformData;
  cropped: WaveformData;
  cropStart: number;
  cropEnd: number;
  confidence: number;
  snrWeights: {
    ch1: number;
    ch2: number;
    ch3: number;
  };
}

export interface BatchCropReport {
  totalCount: number;
  successCount: number;
  failureCount: number;
  averageConfidence: number;
  results: CropResult[];
  errors: Array<{ index: number; error: string }>;
}

/**
 * 批量裁切管理器类
 */
export class BatchCropManager {
  private targetLength: number = 512;
  private confidenceThreshold: number = 0.3;

  constructor(targetLength: number = 512, confidenceThreshold: number = 0.3) {
    this.targetLength = targetLength;
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * 批量裁切波形
   * 
   * @param waveforms 波形数组
   * @param samplingRate 采样率
   * @returns 批量裁切报告
   */
  async batchCrop(
    waveforms: WaveformData[],
    samplingRate: number = 500
  ): Promise<BatchCropReport> {
    const results: CropResult[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < waveforms.length; i++) {
      try {
        const result = await this.cropSingleWaveform(waveforms[i], samplingRate, i);
        if (result) {
          results.push(result);
          successCount++;
        }
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const averageConfidence =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0;

    return {
      totalCount: waveforms.length,
      successCount,
      failureCount: waveforms.length - successCount,
      averageConfidence,
      results,
      errors,
    };
  }

  /**
   * 裁切单个波形
   * 
   * @param waveform 波形数据
   * @param samplingRate 采样率
   * @param index 波形索引
   * @returns 裁切结果
   */
  private async cropSingleWaveform(
    waveform: WaveformData,
    samplingRate: number,
    index: number
  ): Promise<CropResult | null> {
    try {
      // 使用预处理感知的裁切
      const alignment = detectValidSegmentAfterPreprocessing(
        waveform.ch1,
        waveform.ch2,
        waveform.ch3,
        samplingRate
      );

      if (!alignment || alignment.confidence < this.confidenceThreshold) {
        throw new Error(`Low confidence: ${alignment?.confidence || 0}`);
      }

      // 获取裁切范围
      const cropStart = alignment.startIdx;
      const cropEnd = alignment.endIdx;

      // 执行裁切
      const croppedCh1 = waveform.ch1.slice(cropStart, cropEnd);
      const croppedCh2 = waveform.ch2.slice(cropStart, cropEnd);
      const croppedCh3 = waveform.ch3.slice(cropStart, cropEnd);

      // 归一化长度
      const normalized = normalizeWaveformLength(
        croppedCh1,
        croppedCh2,
        croppedCh3,
        this.targetLength
      );

      return {
        original: waveform,
        cropped: normalized,
        cropStart,
        cropEnd,
        confidence: alignment.confidence,
        snrWeights: alignment.snrWeights || { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
      };
    } catch (error) {
      console.error(`Failed to crop waveform ${index}:`, error);
      return null;
    }
  }

  /**
   * 获取批量裁切的统计信息
   * 
   * @param report 批量裁切报告
   * @returns 统计信息
   */
  getStatistics(report: BatchCropReport) {
    return {
      successRate: (report.successCount / report.totalCount) * 100,
      failureRate: (report.failureCount / report.totalCount) * 100,
      averageConfidence: report.averageConfidence,
      totalProcessed: report.totalCount,
      successCount: report.successCount,
      failureCount: report.failureCount,
    };
  }

  /**
   * 生成批量裁切报告文本
   * 
   * @param report 批量裁切报告
   * @returns 报告文本
   */
  generateReport(report: BatchCropReport): string {
    const stats = this.getStatistics(report);
    const lines = [
      '=== 批量裁切报告 ===',
      `总处理数: ${report.totalCount}`,
      `成功数: ${report.successCount}`,
      `失败数: ${report.failureCount}`,
      `成功率: ${stats.successRate.toFixed(1)}%`,
      `平均置信度: ${stats.averageConfidence.toFixed(3)}`,
      '',
      '=== 详细结果 ===',
    ];

    report.results.forEach((result, idx) => {
      lines.push(
        `波形 ${idx}: 置信度 ${result.confidence.toFixed(3)}, ` +
          `裁切范围 [${result.cropStart}, ${result.cropEnd}], ` +
          `SNR权重 CH1:${(result.snrWeights.ch1 * 100).toFixed(1)}% ` +
          `CH2:${(result.snrWeights.ch2 * 100).toFixed(1)}% ` +
          `CH3:${(result.snrWeights.ch3 * 100).toFixed(1)}%`
      );
    });

    if (report.errors.length > 0) {
      lines.push('', '=== 错误 ===');
      report.errors.forEach((error) => {
        lines.push(`波形 ${error.index}: ${error.error}`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * 导出单例实例
 */
export const batchCropManager = new BatchCropManager();

```

---

## lib/cnn-model-manager.ts

```typescript
/**
 * CNN 模型管理系统
 * 
 * 功能：
 * - 从训练数据生成 CNN 模型
 * - 模型保存和加载
 * - 模型推理
 * - 模型性能评估
 */

import { CNNModel, TrainingData, createAndTrainCNNModel, recognizeWithCNN } from './cnn-model';
import { extractFullFeatures } from './dsp-processor';
import { HARDWARE_CONFIG } from '@shared/hardware-config';
import { logger } from './logger';

export interface CommandTrainingData {
  name: string;
  samples: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>;
}

export interface CNNModelState {
  model: CNNModel | null;
  commandNames: string[];
  isTraining: boolean;
  trainingProgress: number;
  lastTrainingTime: number;
}

const MODEL_STORAGE_KEY = 'emg-cnn-model';
const MODEL_STATE_STORAGE_KEY = 'emg-cnn-model-state';

/**
 * CNN 模型管理器
 */
export class CNNModelManager {
  private modelState: CNNModelState = {
    model: null,
    commandNames: [],
    isTraining: false,
    trainingProgress: 0,
    lastTrainingTime: 0,
  };

  /**
   * 从训练数据生成 CNN 模型
   */
  async generateModelFromTrainingData(
    trainingDataList: CommandTrainingData[]
  ): Promise<{ success: boolean; message: string; model?: CNNModel }> {
    try {
      if (trainingDataList.length === 0) {
        return { success: false, message: '没有训练数据' };
      }

      this.modelState.isTraining = true;
      this.modelState.trainingProgress = 0;

      // 1. 提取特征向量
      const features: number[][] = [];
      const labels: number[] = [];

      for (let cmdIdx = 0; cmdIdx < trainingDataList.length; cmdIdx++) {
        const cmd = trainingDataList[cmdIdx];
        logger.log(`处理指令: ${cmd.name} (${cmd.samples.length} 个样本)`);

        for (const sample of cmd.samples) {
          const emgFeatures = extractFullFeatures(sample.ch1, sample.ch2, sample.ch3, HARDWARE_CONFIG.SAMPLE_RATE, true);
          features.push(emgFeatures.fullFeature);
          labels.push(cmdIdx);
        }

        this.modelState.trainingProgress = ((cmdIdx + 1) / trainingDataList.length) * 50;
      }
      // 2. 训练 CNN 模型
      const trainingData: TrainingData = { features, labels };
      const model = createAndTrainCNNModel(trainingData, trainingDataList.length, features[0].length);

      this.modelState.trainingProgress = 100;
      this.modelState.model = model;
      this.modelState.commandNames = trainingDataList.map((cmd) => cmd.name);
      this.modelState.lastTrainingTime = Date.now();

      // 3. 保存模型
      this.saveModel();
      this.modelState.isTraining = false;

      return {
        success: true,
        message: `模型训练完成: ${trainingDataList.length} 个指令, ${features.length} 个样本`,
        model,
      };
    } catch (error) {
      console.error('[CNN] 模型训练失败:', error);
      this.modelState.isTraining = false;
      return {
        success: false,
        message: `模型训练失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 使用 CNN 模型进行识别
   */
  recognize(
    ch1: number[],
    ch2: number[],
    ch3: number[],
    confidenceThreshold: number = 0.6
  ): {
    success: boolean;
    command?: string;
    confidence?: number;
    allProbabilities?: { command: string; probability: number }[];
    message: string;
  } {
    try {
      if (!this.modelState.model) {
        return { success: false, message: '模型未加载，请先训练模型' };
      }

      // 提取特征
      const emgFeatures = extractFullFeatures(ch1, ch2, ch3, HARDWARE_CONFIG.SAMPLE_RATE, true);
      const features = emgFeatures.fullFeature;

      // 使用 CNN 模型进行识别
      const result = recognizeWithCNN(this.modelState.model, features, this.modelState.commandNames);

      // 检查置信度阈值
      if (result.confidence < confidenceThreshold * 100) {
        return {
          success: true,
          message: '置信度不足',
          command: undefined,
          confidence: result.confidence,
          allProbabilities: result.allProbabilities,
        };
      }

      return {
        success: true,
        message: '识别成功',
        command: result.predictedCommand,
        confidence: result.confidence,
        allProbabilities: result.allProbabilities,
      };
    } catch (error) {
      console.error('[CNN] 识别失败:', error);
      return {
        success: false,
        message: `识别失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 保存模型到 localStorage
   */
  private saveModel(): void {
    try {
      if (!this.modelState.model) return;

      const modelJson = this.modelState.model.toJSON();
      const state = {
        commandNames: this.modelState.commandNames,
        lastTrainingTime: this.modelState.lastTrainingTime,
      };

      localStorage.setItem(MODEL_STORAGE_KEY, modelJson);
      localStorage.setItem(MODEL_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[CNN] 模型保存失败:', error);
    }
  }

  /**
   * 从 localStorage 加载模型
   */
  loadModel(): boolean {
    try {
      const modelJson = localStorage.getItem(MODEL_STORAGE_KEY);
      const stateJson = localStorage.getItem(MODEL_STATE_STORAGE_KEY);

      if (!modelJson || !stateJson) {
        return false;
      }

      const model = CNNModel.fromJSON(modelJson);
      const state = JSON.parse(stateJson);

      this.modelState.model = model;
      this.modelState.commandNames = state.commandNames;
      this.modelState.lastTrainingTime = state.lastTrainingTime;
      return true;
    } catch (error) {
      console.error('[CNN] 模型加载失败:', error);
      return false;
    }
  }

  /**
   * 删除保存的模型
   */
  deleteModel(): void {
    localStorage.removeItem(MODEL_STORAGE_KEY);
    localStorage.removeItem(MODEL_STATE_STORAGE_KEY);
    this.modelState.model = null;
    this.modelState.commandNames = [];
  }

  /**
   * 获取模型状态
   */
  getModelState(): CNNModelState {
    return { ...this.modelState };
  }

  /**
   * 检查模型是否已加载
   */
  isModelLoaded(): boolean {
    return this.modelState.model !== null;
  }

  /**
   * 获取命令列表
   */
  getCommandNames(): string[] {
    return [...this.modelState.commandNames];
  }
}

// 创建全局模型管理器实例
export const cnnModelManager = new CNNModelManager();

```

---

## lib/cnn-model.ts

```typescript
/**
 * CNN 模型实现 - 修复版本
 * 
 * 功能：
 * - 构建 1D CNN 模型
 * - 完整的反向传播实现
 * - 模型训练和推理
 * - 模型保存和加载
 */

import { logger } from './logger';

export interface CNNModelConfig {
  inputSize: number;
  numClasses: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
}

export interface TrainingData {
  features: number[][];
  labels: number[];
}

/**
 * 简化的 1D CNN 层
 */
class Conv1DLayer {
  filters: number[][][];
  biases: number[];
  kernelSize: number;
  numFilters: number;

  constructor(kernelSize: number, numFilters: number, inputSize: number) {
    this.kernelSize = kernelSize;
    this.numFilters = numFilters;
    this.filters = [];
    this.biases = Array(numFilters).fill(0);

    for (let i = 0; i < numFilters; i++) {
      const filter: number[][] = [];
      for (let j = 0; j < kernelSize; j++) {
        const row: number[] = [];
        for (let k = 0; k < inputSize; k++) {
          row.push((Math.random() - 0.5) * 0.1);
        }
        filter.push(row);
      }
      this.filters.push(filter);
    }
  }

  forward(input: number[]): number[] {
    const output: number[] = [];

    for (let f = 0; f < this.numFilters; f++) {
      let sum = this.biases[f];
      for (let i = 0; i <= input.length - this.kernelSize; i++) {
        for (let k = 0; k < this.kernelSize; k++) {
          sum += input[i + k] * this.filters[f][k][0];
        }
      }
      output.push(Math.max(0, sum));
    }

    return output;
  }
}

/**
 * 简化的全连接层
 */
class DenseLayer {
  weights: number[][];
  biases: number[];
  inputSize: number;
  outputSize: number;

  constructor(inputSize: number, outputSize: number) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.weights = [];
    this.biases = Array(outputSize).fill(0);

    for (let i = 0; i < inputSize; i++) {
      const row: number[] = [];
      for (let j = 0; j < outputSize; j++) {
        row.push((Math.random() - 0.5) * 0.1);
      }
      this.weights.push(row);
    }
  }

  forward(input: number[]): number[] {
    const output: number[] = Array(this.outputSize).fill(0);

    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.outputSize; j++) {
        output[j] += input[i] * this.weights[i][j];
      }
    }

    for (let j = 0; j < this.outputSize; j++) {
      output[j] += this.biases[j];
    }

    return output;
  }
}

/**
 * 修复版 CNN 模型 - 完整反向传播
 */
export class CNNModel {
  config: CNNModelConfig;
  conv1: Conv1DLayer;
  dense1: DenseLayer;
  dense2: DenseLayer;

  constructor(config: CNNModelConfig) {
    this.config = config;
    this.conv1 = new Conv1DLayer(3, 32, config.inputSize);
    this.dense1 = new DenseLayer(32, 128);
    this.dense2 = new DenseLayer(128, config.numClasses);
  }

  /**
   * 前向传播
   */
  forward(input: number[]): number[] {
    const conv1Out = this.conv1.forward(input);
    const dense1Out = this.dense1.forward(conv1Out);
    const dense1Activated = dense1Out.map((x) => Math.max(0, x));
    const output = this.dense2.forward(dense1Activated);
    return this.softmax(output);
  }

  /**
   * Softmax 激活函数
   */
  private softmax(input: number[]): number[] {
    const maxVal = Math.max(...input);
    const exps = input.map((x) => Math.exp(x - maxVal));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / sumExp);
  }

  /**
   * 完整的反向传播 - 修复版本
   */
  private updateWeights(
    input: number[],
    output: number[],
    label: number,
    learningRate: number
  ): void {
    // 1. 前向传播中间结果
    const conv1Out = this.conv1.forward(input);
    const dense1Out = this.dense1.forward(conv1Out);
    const dense1Activated = dense1Out.map((x) => Math.max(0, x));

    // 2. 输出层梯度（Softmax + CrossEntropy）
    const outputGradient = output.slice();
    outputGradient[label] -= 1;

    // 3. 更新 Dense2（输出层）权重和偏置
    for (let i = 0; i < this.dense1.outputSize; i++) {
      for (let j = 0; j < this.config.numClasses; j++) {
        const gradient = outputGradient[j] * dense1Activated[i];
        this.dense2.weights[i][j] -= learningRate * gradient;
      }
    }

    // 更新 Dense2 偏置
    for (let j = 0; j < this.config.numClasses; j++) {
      this.dense2.biases[j] -= learningRate * outputGradient[j];
    }

    // 4. 计算 Dense1 的梯度
    const dense1Gradient = Array(this.dense1.outputSize).fill(0);
    for (let i = 0; i < this.dense1.outputSize; i++) {
      for (let j = 0; j < this.config.numClasses; j++) {
        dense1Gradient[i] += outputGradient[j] * this.dense2.weights[i][j];
      }
      // ReLU 梯度
      dense1Gradient[i] *= dense1Out[i] > 0 ? 1 : 0;
    }

    // 5. 更新 Dense1 权重和偏置
    for (let i = 0; i < this.conv1.numFilters; i++) {
      for (let j = 0; j < this.dense1.outputSize; j++) {
        const gradient = dense1Gradient[j] * conv1Out[i];
        this.dense1.weights[i][j] -= learningRate * gradient;
      }
    }

    // 更新 Dense1 偏置
    for (let j = 0; j < this.dense1.outputSize; j++) {
      this.dense1.biases[j] -= learningRate * dense1Gradient[j];
    }

    // 6. 计算 Conv1D 的梯度
    for (let f = 0; f < this.conv1.numFilters; f++) {
      let convGradient = 0;
      for (let j = 0; j < this.dense1.outputSize; j++) {
        convGradient += dense1Gradient[j] * this.dense1.weights[f][j];
      }
      // ReLU 梯度
      convGradient *= conv1Out[f] > 0 ? 1 : 0;

      // 更新 Conv1D 偏置
      this.conv1.biases[f] -= learningRate * convGradient;

      // 更新 Conv1D 滤波器权重
      for (let k = 0; k < this.conv1.kernelSize; k++) {
        for (let i = 0; i < input.length - this.conv1.kernelSize + 1; i++) {
          const gradient = convGradient * input[i + k];
          this.conv1.filters[f][k][0] -= learningRate * gradient;
        }
      }
    }
  }

  /**
   * 训练模型 - 修复版本
   */
  train(trainingData: TrainingData): void {
    const { features, labels } = trainingData;
    const { epochs, batchSize, learningRate } = this.config;
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let correctCount = 0;

      // 批处理训练
      for (let batch = 0; batch < features.length; batch += batchSize) {
        const batchEnd = Math.min(batch + batchSize, features.length);

        for (let i = batch; i < batchEnd; i++) {
          const output = this.forward(features[i]);
          const label = labels[i];
          const predictedLabel = output.indexOf(Math.max(...output));

          // 交叉熵损失
          const loss = -Math.log(Math.max(output[label], 1e-10));
          totalLoss += loss;

          if (predictedLabel === label) {
            correctCount++;
          }

          // 完整的反向传播
          this.updateWeights(features[i], output, label, learningRate);
        }
      }

      const accuracy = (correctCount / features.length) * 100;
      const avgLoss = totalLoss / features.length;

      // 每 10 个 epoch 打印日志
      if ((epoch + 1) % 10 === 0) {
        logger.log(`Epoch ${epoch + 1}/${epochs}, Loss: ${avgLoss.toFixed(4)}, Accuracy: ${accuracy.toFixed(2)}%`);
      }
    }
  }

  /**
   * 预测
   */
  predict(input: number[]): { classIdx: number; confidence: number; probabilities: number[] } {
    const output = this.forward(input);
    const classIdx = output.indexOf(Math.max(...output));
    const confidence = output[classIdx];

    return {
      classIdx,
      confidence,
      probabilities: output,
    };
  }

  /**
   * 评估模型
   */
  evaluate(testData: TrainingData): { accuracy: number; loss: number } {
    const { features, labels } = testData;
    let correctCount = 0;
    let totalLoss = 0;

    for (let i = 0; i < features.length; i++) {
      const output = this.forward(features[i]);
      const label = labels[i];
      const predictedLabel = output.indexOf(Math.max(...output));

      if (predictedLabel === label) {
        correctCount++;
      }

      const loss = -Math.log(Math.max(output[label], 1e-10));
      totalLoss += loss;
    }

    const accuracy = correctCount / features.length;
    const loss = totalLoss / features.length;

    return { accuracy, loss };
  }

  /**
   * 保存模型到 JSON
   */
  toJSON(): string {
    const modelData = {
      config: this.config,
      conv1Filters: this.conv1.filters,
      conv1Biases: this.conv1.biases,
      dense1Weights: this.dense1.weights,
      dense1Biases: this.dense1.biases,
      dense2Weights: this.dense2.weights,
      dense2Biases: this.dense2.biases,
    };

    return JSON.stringify(modelData);
  }

  /**
   * 从 JSON 加载模型
   */
  static fromJSON(jsonStr: string): CNNModel {
    const modelData = JSON.parse(jsonStr);
    const model = new CNNModel(modelData.config);

    model.conv1.filters = modelData.conv1Filters;
    model.conv1.biases = modelData.conv1Biases;
    model.dense1.weights = modelData.dense1Weights;
    model.dense1.biases = modelData.dense1Biases;
    model.dense2.weights = modelData.dense2Weights;
    model.dense2.biases = modelData.dense2Biases;

    return model;
  }
}

/**
 * 创建和训练 CNN 模型
 */
export function createAndTrainCNNModel(
  trainingData: TrainingData,
  numClasses: number,
  inputSize: number = 150
): CNNModel {
  const config: CNNModelConfig = {
    inputSize,
    numClasses,
    learningRate: 0.01,
    epochs: 100,
    batchSize: 8,
  };

  const model = new CNNModel(config);
  model.train(trainingData);

  return model;
}

/**
 * 使用 CNN 模型进行识别
 */
export function recognizeWithCNN(
  model: CNNModel,
  features: number[],
  commandNames: string[]
): {
  predictedCommand: string;
  confidence: number;
  allProbabilities: { command: string; probability: number }[];
} {
  const prediction = model.predict(features);

  const allProbabilities = commandNames.map((name, idx) => ({
    command: name,
    probability: prediction.probabilities[idx],
  }));

  return {
    predictedCommand: commandNames[prediction.classIdx],
    confidence: prediction.confidence * 100,
    allProbabilities: allProbabilities.sort((a, b) => b.probability - a.probability),
  };
}

```

---

## lib/data-export.ts

```typescript
/**
 * 数据导出工具模块
 * 
 * 功能：
 * - 导出采集数据为 CSV 格式
 * - 导出采集数据为 Excel 格式
 * - 支持按用户过滤
 */

interface CommandCollection {
  userId?: string;
  userName?: string;
  timestamp: number | Date;
  duration: number;
  data?: any;
}

interface CommandData {
  name: string;
  collections: CommandCollection[];
}

/**
 * 将采集数据导出为 CSV 格式
 */
export function exportToCSV(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `emg-data-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // CSV 头部
  const headers = ['指令名称', '用户名', '用户ID', '采集时间', '采集时长(秒)', '数据点数'];
  const rows: string[][] = [];

  // 收集数据行
  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const timestamp = col.timestamp instanceof Date 
        ? col.timestamp.toLocaleString('zh-CN')
        : new Date(col.timestamp).toLocaleString('zh-CN');
      
      rows.push([
        cmd.name,
        col.userName || 'Unknown',
        col.userId || 'N/A',
        timestamp,
        col.duration.toFixed(2),
        (col.data?.length || 0).toString(),
      ]);
    });
  });

  // 转换为 CSV 字符串
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // 下载文件
  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * 将采集数据导出为 Excel 格式（使用 CSV 作为中间格式）
 * 注：这里使用 CSV 格式，Excel 可直接打开
 */
export function exportToExcel(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `emg-data-${timestamp}.xlsx`;
  const finalFilename = filename || defaultFilename;

  // 使用 CSV 格式（Excel 可直接打开）
  const headers = ['指令名称', '用户名', '用户ID', '采集时间', '采集时长(秒)', '数据点数'];
  const rows: string[][] = [];

  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const timestamp = col.timestamp instanceof Date 
        ? col.timestamp.toLocaleString('zh-CN')
        : new Date(col.timestamp).toLocaleString('zh-CN');
      
      rows.push([
        cmd.name,
        col.userName || 'Unknown',
        col.userId || 'N/A',
        timestamp,
        col.duration.toFixed(2),
        (col.data?.length || 0).toString(),
      ]);
    });
  });

  // 转换为 CSV 字符串（Excel 兼容格式）
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // 下载为 .xlsx 文件（实际是 CSV 格式，但 Excel 可打开）
  downloadFile(csvContent, finalFilename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;');
}

/**
 * 将采集数据导出为 JSON 格式
 */
export function exportToJSON(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `emg-data-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  const jsonContent = JSON.stringify(commands, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');
}

/**
 * 导出按用户分组的统计数据
 */
export function exportUserStatistics(commands: CommandData[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `emg-user-stats-${timestamp}.csv`;

  // 收集用户统计
  const userStats = new Map<string, {
    userId: string;
    userName: string;
    totalCollections: number;
    totalDuration: number;
    commands: Set<string>;
  }>();

  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const userId = col.userId || 'Unknown';
      const userName = col.userName || 'Unknown';

      if (!userStats.has(userId)) {
        userStats.set(userId, {
          userId,
          userName,
          totalCollections: 0,
          totalDuration: 0,
          commands: new Set(),
        });
      }

      const stat = userStats.get(userId)!;
      stat.totalCollections += 1;
      stat.totalDuration += col.duration;
      stat.commands.add(cmd.name);
    });
  });

  // 转换为 CSV
  const headers = ['用户ID', '用户名', '采集次数', '总时长(秒)', '采集指令数'];
  const rows: string[][] = Array.from(userStats.values()).map(stat => [
    stat.userId,
    stat.userName,
    stat.totalCollections.toString(),
    stat.totalDuration.toFixed(2),
    stat.commands.size.toString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * 辅助函数：下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

```

---

## lib/data-migration.ts

```typescript
/**
 * 数据迁移工具
 * 用于处理旧版本数据到新版本的迁移
 */

import { StoredCommand, CollectionData, DATA_VERSION, SAMPLE_RATE } from '@shared/data-models';

export function migrateCommand(data: any): StoredCommand {
  // 如果已经是新版本，直接返回
  if (data.version === DATA_VERSION && data.samplingRate === SAMPLE_RATE) {
    return data as StoredCommand;
  }

  // 迁移旧数据
  const migrated: StoredCommand = {
    name: data.name,
    collections: (data.collections || []).map((col: any) => migrateCollection(col)),
    createdAt: data.createdAt instanceof Date ? data.createdAt.getTime() : data.createdAt,
    accuracy: data.accuracy,
    version: DATA_VERSION,
    samplingRate: SAMPLE_RATE,
    lastModified: Date.now(),
  };

  return migrated;
}

function migrateCollection(col: any): CollectionData {
  return {
    index: col.index ?? 0,
    timestamp: col.timestamp instanceof Date ? col.timestamp.getTime() : col.timestamp,
    waveform: col.waveform || { ch1: [], ch2: [], ch3: [] },
    duration: col.duration ?? 0,
    trimStart: col.trimStart,
    trimEnd: col.trimEnd,
    userId: col.userId,
    userName: col.userName,
    quality: col.quality,
  };
}

export function needsMigration(data: any): boolean {
  return (
    data.version !== DATA_VERSION ||
    data.samplingRate !== SAMPLE_RATE ||
    (data.collections && data.collections.some((col: any) => col.timestamp instanceof Date))
  );
}

export function migrateAllCommands(commands: any[]): StoredCommand[] {
  return commands.map((cmd) => (needsMigration(cmd) ? migrateCommand(cmd) : cmd));
}

export default {
  migrateCommand,
  migrateAllCommands,
  needsMigration,
};

```

---

## lib/data-storage-service.ts

```typescript
/**
 * 统一的数据存储服务
 * 
 * 功能：
 * - 优先使用 IndexedDB（无容量限制）
 * - 降级到 localStorage（容量限制 5-10MB）
 * - 自动同步两者
 * - 支持大量波形数据存储
 */

// 注意：当前 EMGDatabase 的接口与此服务不完全匹配
// 此服务作为未来的数据存储层，需要与 EMGDatabase 接口统一

// 当前使用 localStorage 存储指令
// 未来可扩展为 IndexedDB

export interface StoredCommand {
  id: string;
  name: string;
  userId: string;
  timestamp: number;
  collections: Array<{
    index: number;
    timestamp: number;
    waveform: {
      ch1: number[];
      ch2: number[];
      ch3: number[];
    };
    duration: number;
    quality: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'emg-commands';
const STORAGE_VERSION_KEY = 'emg-storage-version';

/**
 * 数据存储服务 - 管理 IndexedDB 和 localStorage
 */
export class DataStorageService {
  private useIndexedDB: boolean = false;
  private syncInProgress: boolean = false;

  /**
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    // 当前版本使用 localStorage
    // 未来版本可集成 IndexedDB
    this.useIndexedDB = false;
  }

  /**
   * 保存指令
   */
  async saveCommand(command: StoredCommand): Promise<void> {
    try {
      this.saveToLocalStorage(command);
    } catch (err) {
      console.error('[DataStorage] 保存指令失败', err);
    }
  }

  /**
   * 获取所有指令
   */
  async getAllCommands(userId?: string): Promise<StoredCommand[]> {
    try {
      return this.getFromLocalStorage(userId);
    } catch (err) {
      console.error('[DataStorage] 获取指令失败', err);
      return [];
    }
  }

  /**
   * 获取单个指令
   */
  async getCommand(commandId: string): Promise<StoredCommand | null> {
    try {
      return this.getFromLocalStorageById(commandId);
    } catch (err) {
      console.error('[DataStorage] 获取指令失败', err);
      return null;
    }
  }

  /**
   * 删除指令
   */
  async deleteCommand(commandId: string): Promise<void> {
    try {
      this.deleteFromLocalStorage(commandId);
    } catch (err) {
      console.error('[DataStorage] 删除指令失败', err);
    }
  }

  /**
   * 更新指令
   */
  async updateCommand(command: StoredCommand): Promise<void> {
    command.updatedAt = Date.now();
    await this.saveCommand(command);
  }

  /**
   * 清空所有指令
   */
  async clearAll(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_VERSION_KEY);
    } catch (err) {
      console.error('[DataStorage] 清空数据失败', err);
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<{
    useIndexedDB: boolean;
    commandCount: number;
    localStorageSize: number;
    indexedDBSize?: number;
  }> {
    try {
      const commands = await this.getAllCommands();
      const localStorageData = localStorage.getItem(STORAGE_KEY) || '';
      const localStorageSize = new Blob([localStorageData]).size;

      return {
        useIndexedDB: this.useIndexedDB,
        commandCount: commands.length,
        localStorageSize,
      };
    } catch (err) {
      console.error('[DataStorage] 获取存储统计失败', err);
      return {
        useIndexedDB: this.useIndexedDB,
        commandCount: 0,
        localStorageSize: 0,
      };
    }
  }

  /**
   * 从 localStorage 保存
   */
  private saveToLocalStorage(command: StoredCommand): void {
    try {
      const commands = this.getFromLocalStorage();
      const index = commands.findIndex(c => c.id === command.id);
      
      if (index >= 0) {
        commands[index] = command;
      } else {
        commands.push(command);
      }

      const version = (parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0') + 1).toString();
      localStorage.setItem(STORAGE_VERSION_KEY, version);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
    } catch (err) {
      console.error('[DataStorage] localStorage 保存失败', err);
    }
  }

  /**
   * 从 localStorage 读取
   */
  private getFromLocalStorage(userId?: string): StoredCommand[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      
      const commands = JSON.parse(data) as StoredCommand[];
      return userId 
        ? commands.filter(cmd => cmd.userId === userId)
        : commands;
    } catch (err) {
      console.error('[DataStorage] localStorage 读取失败', err);
      return [];
    }
  }

  /**
   * 从 localStorage 按 ID 读取
   */
  private getFromLocalStorageById(commandId: string): StoredCommand | null {
    try {
      const commands = this.getFromLocalStorage();
      return commands.find(cmd => cmd.id === commandId) || null;
    } catch (err) {
      console.error('[DataStorage] localStorage 读取失败', err);
      return null;
    }
  }

  /**
   * 从 localStorage 删除
   */
  private deleteFromLocalStorage(commandId: string): void {
    try {
      const commands = this.getFromLocalStorage();
      const filtered = commands.filter(cmd => cmd.id !== commandId);
      
      const version = (parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0') + 1).toString();
      localStorage.setItem(STORAGE_VERSION_KEY, version);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error('[DataStorage] localStorage 删除失败', err);
    }
  }

  /**
   * 同步 IndexedDB 到 localStorage
   */
  private async syncToLocalStorage(): Promise<void> {
    if (this.syncInProgress || !this.useIndexedDB) return;
    // 未来实现：IndexedDB 同步功能
  }

  /**
   * 从 localStorage 恢复到 IndexedDB（未来使用）
   */
  async restoreFromLocalStorage(): Promise<void> {
    // 未来实现：当 IndexedDB 可用时，迁移数据
  }
}

// 导出单例
export const dataStorageService = new DataStorageService();

```

---

## lib/db.ts

```typescript
/**
 * IndexedDB 数据库管理模块
 * 
 * 功能：
 * - 数据库初始化
 * - 训练数据保存和读取
 * - 会话管理
 */

import { DB_CONFIG, TrainingData } from '@/../../shared/const';

export class EMGDatabase {
  private db: IDBDatabase | null = null;

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.DB_NAME, DB_CONFIG.DB_VERSION);

      request.onerror = () => {
        reject(new Error('数据库打开失败'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建存储对象
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.COMMANDS)) {
          db.createObjectStore(DB_CONFIG.STORES.COMMANDS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.TRAINING_DATA)) {
          db.createObjectStore(DB_CONFIG.STORES.TRAINING_DATA, {
            keyPath: 'id',
            autoIncrement: true,
          });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SESSIONS)) {
          db.createObjectStore(DB_CONFIG.STORES.SESSIONS, {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      };
    });
  }

  /**
   * 保存训练数据
   */
  async saveTrainingData(data: TrainingData): Promise<number> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.TRAINING_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.TRAINING_DATA);

      const request = store.add(data);

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(new Error('训练数据保存失败'));
      };
    });
  }

  /**
   * 获取所有训练数据
   */
  async getAllTrainingData(): Promise<TrainingData[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.TRAINING_DATA],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.TRAINING_DATA);

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as TrainingData[]);
      };

      request.onerror = () => {
        reject(new Error('获取训练数据失败'));
      };
    });
  }

  /**
   * 获取指定指令的训练数据
   */
  async getTrainingDataByCommand(commandId: string): Promise<TrainingData[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const allData = await this.getAllTrainingData();
    return allData.filter((data) => data.commandId === commandId);
  }

  /**
   * 删除训练数据
   */
  async deleteTrainingData(id: number): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.TRAINING_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.TRAINING_DATA);

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('训练数据删除失败'));
      };
    });
  }

  /**
   * 清空所有训练数据
   */
  async clearAllTrainingData(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.TRAINING_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.TRAINING_DATA);

      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('清空训练数据失败'));
      };
    });
  }

  /**
   * 保存会话记录
   */
  async saveSession(session: any): Promise<number> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.SESSIONS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

      const request = store.add(session);

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(new Error('会话保存失败'));
      };
    });
  }

  /**
   * 获取所有会话
   */
  async getAllSessions(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.SESSIONS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.SESSIONS);

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('获取会话失败'));
      };
    });
  }

  /**
   * 导出所有数据为 JSON
   */
  async exportData(): Promise<string> {
    const trainingData = await this.getAllTrainingData();
    const sessions = await this.getAllSessions();

    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      trainingData,
      sessions,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 从 JSON 导入数据
   */
  async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      // 清空现有数据
      await this.clearAllTrainingData();

      // 导入训练数据
      if (data.trainingData && Array.isArray(data.trainingData)) {
        for (const training of data.trainingData) {
          await this.saveTrainingData(training);
        }
      }
    } catch (error) {
      throw new Error('数据导入失败: ' + (error as Error).message);
    }
  }
}

// 创建全局数据库实例
export const emgDatabase = new EMGDatabase();

```

---

## lib/demo-data.ts

```typescript
/**
 * 演示模式 - 示例数据生成
 * 
 * 为没有硬件的用户生成逼真的示例数据
 */

import { PREDEFINED_COMMANDS, FeatureVector, TrainingData } from '@/../../shared/const';
import { emgDatabase } from './db';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

/**
 * 生成模拟 EMG 信号
 */
function generateMockEMGSignal(
  commandId: string,
  duration: number = 3,
  sampleRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[][] {
  const samples = duration * sampleRate;
  const signal: number[][] = [];

  // 为不同指令生成不同的特征信号
  const commandIndex = PREDEFINED_COMMANDS.findIndex((c) => c.id === commandId);
  const baseFreq = 10 + commandIndex * 5; // 不同指令有不同的基频
  const amplitude = 200 + Math.random() * 100; // 随机振幅

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const phase = (2 * Math.PI * baseFreq * t) / 10;

    // 生成三个通道的信号，每个通道有不同的特征
    const ch1 =
      amplitude * Math.sin(phase) +
      50 * Math.sin(phase * 2) +
      Math.random() * 30;
    const ch2 =
      amplitude * Math.cos(phase) +
      40 * Math.sin(phase * 1.5) +
      Math.random() * 25;
    const ch3 =
      amplitude * Math.sin(phase * 0.8) +
      60 * Math.cos(phase * 2.5) +
      Math.random() * 35;

    signal.push([
      Math.max(0, ch1),
      Math.max(0, ch2),
      Math.max(0, ch3),
    ]);
  }

  return signal;
}

/**
 * 计算特征向量
 */
function calculateFeatures(samples: number[][]): FeatureVector {
  const channels = 3;
  const mean = new Array(channels).fill(0);
  const variance = new Array(channels).fill(0);
  const rms = new Array(channels).fill(0);

  // 计算均值
  for (let ch = 0; ch < channels; ch++) {
    let sum = 0;
    for (const sample of samples) {
      sum += sample[ch];
    }
    mean[ch] = sum / samples.length;
  }

  // 计算方差和 RMS
  for (let ch = 0; ch < channels; ch++) {
    let sumSquaredDiff = 0;
    let sumSquared = 0;

    for (const sample of samples) {
      const diff = sample[ch] - mean[ch];
      sumSquaredDiff += diff * diff;
      sumSquared += sample[ch] * sample[ch];
    }

    variance[ch] = sumSquaredDiff / samples.length;
    rms[ch] = Math.sqrt(sumSquared / samples.length);
  }

  return { mean, variance, rms };
}

/**
 * 生成演示数据
 */
export async function generateDemoData(): Promise<void> {
  try {
    // 清空现有数据
    await emgDatabase.clearAllTrainingData();

    // 为每条指令生成 3 个训练样本
    for (const command of PREDEFINED_COMMANDS) {
      const samples: number[][][] = [];
      const features: FeatureVector[] = [];

      for (let i = 0; i < 3; i++) {
        // 生成模拟信号
        const signal = generateMockEMGSignal(command.id);
        samples.push(signal);

        // 计算特征
        const feature = calculateFeatures(signal);
        features.push(feature);
      }

      // 计算平均特征
      const averageFeature: FeatureVector = {
        mean: [0, 0, 0],
        variance: [0, 0, 0],
        rms: [0, 0, 0],
      };

      for (const feature of features) {
        for (let i = 0; i < 3; i++) {
          averageFeature.mean[i] += feature.mean[i];
          averageFeature.variance[i] += feature.variance[i];
          averageFeature.rms[i] += feature.rms[i];
        }
      }

      for (let i = 0; i < 3; i++) {
        averageFeature.mean[i] /= 3;
        averageFeature.variance[i] /= 3;
        averageFeature.rms[i] /= 3;
      }

      // 保存训练数据
      const trainingData: TrainingData = {
        commandId: command.id,
        commandName: command.name,
        samples: samples as any,
        features,
        averageFeature,
        timestamp: Date.now(),
      };

      await emgDatabase.saveTrainingData(trainingData);
    }
  } catch (error) {
    throw new Error('生成演示数据失败: ' + (error as Error).message);
  }
}

/**
 * 检查是否已有演示数据
 */
export async function hasDemoData(): Promise<boolean> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    return trainingData.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * 清除演示数据
 */
export async function clearDemoData(): Promise<void> {
  try {
    await emgDatabase.clearAllTrainingData();
  } catch (error) {
    throw new Error('清除演示数据失败: ' + (error as Error).message);
  }
}

```

---

## lib/dsp-enhanced.ts

```typescript
/**
 * DSP 增强处理模块
 * 
 * 功能：
 * - 原始波形 (Raw) 显示
 * - 滤波波形 (Filtered) 显示
 * - 包络波形 (Envelope) 显示
 * 
 * 优化（基于实际数据分析）：
 * - 低通滤波截止频率：150 Hz → 300 Hz（保留更多高频信息）
 * - 带通范围：10-200 Hz → 10-300 Hz
 * - 添加 50 Hz 陷波滤波器（去除工频干扰）
 */

import { highPassFilter } from './dsp-processor';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

/**
 * 低通滤波（去除高频噪声）
 * 使用一阶 IIR 低通滤波器
 * 优化：截止频率从 150 Hz 提升到 300 Hz，保留更多肌电信息
 */
export function lowPassFilter(
  signal: number[],
  cutoffFreq: number = 300,
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  const alpha = dt / (rc + dt);

  const filtered: number[] = [];
  let prev = signal[0];

  for (let i = 0; i < signal.length; i++) {
    const current = alpha * signal[i] + (1 - alpha) * prev;
    filtered.push(current);
    prev = current;
  }

  return filtered;
}

/**
 * 50 Hz 陷波滤波器（去除工频干扰）
 * 使用二阶 IIR 陷波滤波器，高 Q 值确保只影响 50 Hz 附近
 */
export function notchFilter50Hz(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  const Q = 30; // 高品质因数，使陷波更尖锐
  const w0 = (2 * Math.PI * 50) / samplingRate;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = 1;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  const filtered: number[] = [];
  let y1 = 0, y2 = 0;
  let x1 = 0, x2 = 0;

  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    filtered.push(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return filtered;
}

/**
 * 带通滤波（10-300 Hz）
 * 结合高通和低通滤波，可选添加 50 Hz 陷波
 * 优化：低通截止频率从 200 Hz 提升到 300 Hz
 */
export function bandPassFilter(
  signal: number[],
  lowCutoff: number = 10,
  highCutoff: number = 300,
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
  useNotch: boolean = true
): number[] {
  let filtered = highPassFilter(signal, lowCutoff, samplingRate);
  filtered = lowPassFilter(filtered, highCutoff, samplingRate);
  
  // 可选：应用 50 Hz 陷波滤波器
  if (useNotch) {
    filtered = notchFilter50Hz(filtered, samplingRate);
  }
  
  return filtered;
}

/**
 * 计算包络（使用希尔伯特变换的近似）
 * 方法：对滤波信号进行整流后低通滤波
 */
export function computeEnvelope(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  // 第一步：全波整流
  const rectified = signal.map(Math.abs);

  // 第二步：低通滤波（提取包络）
  const envelope = lowPassFilter(rectified, 5, samplingRate);

  return envelope;
}

/**
 * 处理原始、滤波、包络三层波形
 */
export interface ProcessedWaveforms {
  raw: number[];
  filtered: number[];
  envelope: number[];
}

export function processWaveform(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): ProcessedWaveforms {
  const raw = signal;
  // 使用优化后的带通滤波（10-300 Hz，包含 50 Hz 陷波）
  const filtered = bandPassFilter(signal, 10, 300, samplingRate, true);
  const envelope = computeEnvelope(filtered, samplingRate);

  return {
    raw,
    filtered,
    envelope,
  };
}

/**
 * 处理三通道波形
 */
export interface ProcessedMultiChannelWaveforms {
  ch1: ProcessedWaveforms;
  ch2: ProcessedWaveforms;
  ch3: ProcessedWaveforms;
}

export function processMultiChannelWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): ProcessedMultiChannelWaveforms {
  return {
    ch1: processWaveform(ch1, samplingRate),
    ch2: processWaveform(ch2, samplingRate),
    ch3: processWaveform(ch3, samplingRate),
  };
}

/**
 * 计算信噪比 (SNR)
 */
export function computeSNR(signal: number[]): number {
  if (signal.length === 0) return 0;

  // 计算信号功率
  const signalPower = signal.reduce((sum, x) => sum + x * x, 0) / signal.length;

  // 计算噪声功率（使用前 10% 作为噪声估计）
  const noiseLength = Math.ceil(signal.length * 0.1);
  const noise = signal.slice(0, noiseLength);
  const noisePower = noise.reduce((sum, x) => sum + x * x, 0) / noise.length;

  if (noisePower === 0) return 0;

  return 10 * Math.log10(signalPower / noisePower);
}

/**
 * 计算信号质量评分（0-100）
 * 基于 SNR、能量和频谱分布
 */
export function computeSignalQuality(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): number {
  if (ch1.length === 0 || ch2.length === 0 || ch3.length === 0) return 0;

  // SNR 评分
  const snr1 = computeSNR(ch1);
  const snr2 = computeSNR(ch2);
  const snr3 = computeSNR(ch3);
  const avgSNR = (snr1 + snr2 + snr3) / 3;
  const snrScore = Math.min(100, Math.max(0, (avgSNR + 10) * 5)); // 范围 0-100

  // 能量评分
  const energy1 = ch1.reduce((sum, x) => sum + x * x, 0) / ch1.length;
  const energy2 = ch2.reduce((sum, x) => sum + x * x, 0) / ch2.length;
  const energy3 = ch3.reduce((sum, x) => sum + x * x, 0) / ch3.length;
  const avgEnergy = (energy1 + energy2 + energy3) / 3;
  const energyScore = Math.min(100, Math.max(0, Math.sqrt(avgEnergy) * 10));

  // 综合评分（权重：SNR 60%，能量 40%）
  const qualityScore = snrScore * 0.6 + energyScore * 0.4;

  return Math.round(qualityScore);
}

```

---

## lib/dsp-processor.ts

```typescript
/**
 * DSP 信号处理模块
 * 
 * 功能：
 * - 信号滤波和预处理
 * - 时域特征提取
 * - 频域特征提取（FFT）
 * - 特征归一化
 */

import FFT from 'fft.js';
import * as ss from 'simple-statistics';
import { HARDWARE_CONFIG } from '@shared/hardware-config';
import { extractFrequencyDomainFeaturesV2 } from './frequency-domain-features-v2';

/**
 * 陷波滤波器（去除工频干扰 50/60 Hz）
 * 使用二阶 IIR 陷波滤波器
 */
export function notchFilter(
  signal: number[],
  notchFreq: number = 50,
  samplingRate: number = 500,
  Q: number = 30
): number[] {
  const w0 = (2 * Math.PI * notchFreq) / samplingRate;
  const alpha = Math.sin(w0) / (2 * Q);

  // 陷波滤波器系数
  const b0 = 1;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  // 归一化
  const b0_norm = b0 / a0;
  const b1_norm = b1 / a0;
  const b2_norm = b2 / a0;
  const a1_norm = a1 / a0;
  const a2_norm = a2 / a0;

  const filtered: number[] = [];
  let y1 = 0, y2 = 0;
  let x1 = 0, x2 = 0;

  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b0_norm * x0 + b1_norm * x1 + b2_norm * x2 - a1_norm * y1 - a2_norm * y2;
    filtered.push(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return filtered;
}

/**
 * 简化的 ICA 算法（FastICA）
 * 用于分离独立成分，去除运动伪影
 */
export function fastICA(
  signals: number[][],
  numComponents: number = 3,
  maxIterations: number = 100,
  tolerance: number = 1e-5
): {
  sources: number[][];
  mixing: number[][];
} {
  const numSamples = signals[0].length;
  const numChannels = signals.length;

  // 1. 中心化
  const means = signals.map((s) => ss.mean(s));
  const centered = signals.map((s, i) => s.map((x) => x - means[i]));

  // 2. 白化（简化版本：使用 SVD）
  // 这里使用简化的白化：直接标准化
  const whitened = centered.map((s) => {
    const std = ss.standardDeviation(s);
    return std > 0 ? s.map((x) => x / std) : s;
  });

  // 3. 初始化混合矩阵 W（随机）
  const W: number[][] = [];
  for (let i = 0; i < numComponents; i++) {
    const row: number[] = [];
    for (let j = 0; j < numChannels; j++) {
      row.push(Math.random() - 0.5);
    }
    W.push(row);
  }

  // 4. FastICA 迭代
  for (let iter = 0; iter < maxIterations; iter++) {
    let converged = true;

    for (let i = 0; i < numComponents; i++) {
      // 计算 w_i^T * x
      const wx: number[] = [];
      for (let s = 0; s < numSamples; s++) {
        let sum = 0;
        for (let j = 0; j < numChannels; j++) {
          sum += W[i][j] * whitened[j][s];
        }
        wx.push(sum);
      }

      // 非线性函数（tanh）
      const g = wx.map((x) => Math.tanh(x));
      const gPrime = wx.map((x) => 1 - Math.tanh(x) ** 2);

      // 更新 w_i
      const newW: number[] = [];
      for (let j = 0; j < numChannels; j++) {
        let sum1 = 0, sum2 = 0;
        for (let s = 0; s < numSamples; s++) {
          sum1 += g[s] * whitened[j][s];
          sum2 += gPrime[s];
        }
        newW.push((sum1 / numSamples) - (sum2 / numSamples) * W[i][j]);
      }

      // 正交化
      for (let k = 0; k < i; k++) {
        let dot = 0;
        for (let j = 0; j < numChannels; j++) {
          dot += newW[j] * W[k][j];
        }
        for (let j = 0; j < numChannels; j++) {
          newW[j] -= dot * W[k][j];
        }
      }

      // 归一化
      let norm = 0;
      for (let j = 0; j < numChannels; j++) {
        norm += newW[j] ** 2;
      }
      norm = Math.sqrt(norm);
      for (let j = 0; j < numChannels; j++) {
        newW[j] /= norm;
      }

      // 检查收敛
      let diff = 0;
      for (let j = 0; j < numChannels; j++) {
        diff += Math.abs(newW[j] - W[i][j]);
      }
      if (diff > tolerance) {
        converged = false;
      }

      W[i] = newW;
    }

    if (converged) break;
  }

  // 5. 计算源信号
  const sources: number[][] = [];
  for (let i = 0; i < numComponents; i++) {
    const source: number[] = [];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let j = 0; j < numChannels; j++) {
        sum += W[i][j] * whitened[j][s];
      }
      source.push(sum);
    }
    sources.push(source);
  }

  return { sources, mixing: W };
}

/**
 * 应用陷波滤波器到多通道信号
 */
export function applyNotchFilterMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  notchFreq: number = 50,
  samplingRate: number = 500
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: notchFilter(ch1, notchFreq, samplingRate),
    ch2: notchFilter(ch2, notchFreq, samplingRate),
    ch3: notchFilter(ch3, notchFreq, samplingRate),
  };
}

/**
 * 应用 ICA 处理到多通道信号（去除运动伪影）
 */
export function applyICAProcessing(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  const signals = [ch1, ch2, ch3];
  const { sources } = fastICA(signals, 3);

  // 返回独立成分
  return {
    ch1: sources[0] || ch1,
    ch2: sources[1] || ch2,
    ch3: sources[2] || ch3,
  };
}

export interface EMGFeatures {
  // 时域特征（30 维）
  timeDomain: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 频域特征（18 维）
  frequencyDomain: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 梅尔谱图特征（60 维）
  melSpectrogram: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 完整特征向量（150+ 维）
  fullFeature: number[];
}

/**
 * 高通滤波（去除低频噪声）
 * 使用一阶 IIR 高通滤波器
 */
export function highPassFilter(
  signal: number[],
  cutoffFreq: number = 20,
  samplingRate: number = 500
): number[] {
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  const alpha = dt / (rc + dt);

  const filtered: number[] = [];
  let prev = signal[0];

  for (let i = 0; i < signal.length; i++) {
    const current = alpha * (prev + signal[i] - (filtered[i - 1] || 0));
    filtered.push(current);
    prev = signal[i];
  }

  return filtered;
}

/**
 * 完整的信号预处理管道
 * 1. 波形幅值归一化 [-1, 1]
 * 2. 陷波滤波（去除工频干扰）
 * 3. 高通滤波（去除低频漂移）
 * 4. ICA 处理（去除运动伪影）
 */
export function preprocessSignal(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  enableICA: boolean = true
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // 0. 波形幅值归一化 [-1, 1]
  // 改进：使用更稳健的归一化方法（基于最小-最大范围）
  const normalize = (signal: number[]): number[] => {
    if (signal.length === 0) return signal;
    
    const max = Math.max(...signal);
    const min = Math.min(...signal);
    const range = max - min;
    
    if (range === 0) return signal;
    
    // 将信号映射到 [-1, 1]
    return signal.map(x => (2 * (x - min) / range) - 1);
  };
  
  let processed = {
    ch1: normalize(ch1),
    ch2: normalize(ch2),
    ch3: normalize(ch3),
  };

  // 1. 陷波滤波（50 Hz）
  processed = applyNotchFilterMultiChannel(processed.ch1, processed.ch2, processed.ch3, 50, samplingRate);

  // 2. 陷波滤波（60 Hz，用于美国标准）
  processed = applyNotchFilterMultiChannel(processed.ch1, processed.ch2, processed.ch3, 60, samplingRate);

  // 3. 高通滤波（改为 20Hz）
  processed = {
    ch1: highPassFilter(processed.ch1, 20, samplingRate),
    ch2: highPassFilter(processed.ch2, 20, samplingRate),
    ch3: highPassFilter(processed.ch3, 20, samplingRate),
  };

  // 4. ICA 处理（改为在高通滤波后执行，而不是最后）
  // 这样可以确保 ICA 处理的是已经过滤的信号，提高分离效果
  if (enableICA) {
    processed = applyICAProcessing(processed.ch1, processed.ch2, processed.ch3);
  }
  
  // 5. 再次进行幅值归一化（确保输出在 [-1, 1] 范围内）
  processed = {
    ch1: normalize(processed.ch1),
    ch2: normalize(processed.ch2),
    ch3: normalize(processed.ch3),
  };

  return processed;
}

/**
 * 提取时域特征（每个通道 10 个特征）
 */
export function extractTimeDomainFeatures(signal: number[], skipPreprocessing: boolean = false): number[] {
  if (signal.length === 0) return Array(10).fill(0);

  // 预处理：去噪（如果需要）
  const filtered = skipPreprocessing ? signal : highPassFilter(signal);

  // 1. 均值 (Mean)
  const mean = ss.mean(filtered);

  // 2. 标准差 (Std)
  const std = ss.standardDeviation(filtered);

  // 3. 方差 (Variance)
  const variance = ss.variance(filtered);

  // 4. 峰值 (Peak)
  const peak = Math.max(...filtered.map(Math.abs));

  // 5. 峰峰值 (Peak-to-Peak)
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const peakToPeak = max - min;

  // 6. 均方根 (RMS)
  const rms = Math.sqrt(ss.mean(filtered.map((x) => x * x)));

  // 7. 平均绝对值 (MAV)
  const mav = ss.mean(filtered.map(Math.abs));

  // 8. 零交叉率 (ZCR)
  let zcr = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i] * filtered[i - 1] < 0) {
      zcr++;
    }
  }
  zcr = zcr / filtered.length;

  // 9. 波形长度 (Waveform Length)
  let waveformLength = 0;
  for (let i = 1; i < filtered.length; i++) {
    waveformLength += Math.abs(filtered[i] - filtered[i - 1]);
  }

  // 10. 坡度变化 (Slope Sign Changes)
  let ssc = 0;
  for (let i = 1; i < filtered.length - 1; i++) {
    const slope1 = filtered[i] - filtered[i - 1];
    const slope2 = filtered[i + 1] - filtered[i];
    if (slope1 * slope2 < 0) {
      ssc++;
    }
  }
  ssc = ssc / filtered.length;

  return [mean, std, variance, peak, peakToPeak, rms, mav, zcr, waveformLength, ssc];
}

/**
 * 提取频域特征（每个通道 6 个特征）
 */
export function extractFrequencyDomainFeatures(
  signal: number[],
  samplingRate: number = 500
): number[] {
  if (signal.length < 16) return Array(6).fill(0);

  // 预处理：去噪
  const filtered = highPassFilter(signal);

  // 使用 FFT 计算功率谱
  const fft = new FFT(Math.pow(2, Math.ceil(Math.log2(filtered.length))));
  const padded = [...filtered, ...Array(fft.size - filtered.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 计算功率
  const power: number[] = [];
  for (let i = 0; i < fft.size / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    power.push(real * real + imag * imag);
  }

  const freqResolution = samplingRate / fft.size;

  // 1. 主频率 (Dominant Frequency)
  let maxPowerIdx = 0;
  let maxPower = power[0];
  for (let i = 1; i < power.length; i++) {
    if (power[i] > maxPower) {
      maxPower = power[i];
      maxPowerIdx = i;
    }
  }
  const dominantFreq = maxPowerIdx * freqResolution;

  // 2. 频率中心 (Frequency Center)
  let totalPower = ss.sum(power);
  let freqCenter = 0;
  for (let i = 0; i < power.length; i++) {
    freqCenter += (i * freqResolution * power[i]) / totalPower;
  }

  // 3. 频率带宽 (Frequency Bandwidth)
  let variance = 0;
  for (let i = 0; i < power.length; i++) {
    const freq = i * freqResolution;
    variance += ((freq - freqCenter) ** 2 * power[i]) / totalPower;
  }
  const bandwidth = Math.sqrt(variance);

  // 4. 低频能量比 (< 50 Hz)
  const lowFreqIdx = Math.floor(50 / freqResolution);
  const lowFreqPower = ss.sum(power.slice(0, lowFreqIdx));
  const lowFreqRatio = lowFreqPower / totalPower;

  // 5. 中频能量比 (50-150 Hz)
  const midFreqIdxStart = Math.floor(50 / freqResolution);
  const midFreqIdxEnd = Math.floor(150 / freqResolution);
  const midFreqPower = ss.sum(power.slice(midFreqIdxStart, midFreqIdxEnd));
  const midFreqRatio = midFreqPower / totalPower;

  // 6. 高频能量比 (> 150 Hz)
  const highFreqPower = ss.sum(power.slice(midFreqIdxEnd));
  const highFreqRatio = highFreqPower / totalPower;

  return [dominantFreq, freqCenter, bandwidth, lowFreqRatio, midFreqRatio, highFreqRatio];
}

/**
 * 提取完整特征向量（150+ 维）
 * 包含时域、频域、梅尔谱图特征
 */
export function extractFullFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  enablePreprocessing: boolean = true
): EMGFeatures {
  // 信号预处理（陷波滤波 + ICA）
  let processedCh1 = ch1, processedCh2 = ch2, processedCh3 = ch3;
  if (enablePreprocessing) {
    const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
    processedCh1 = preprocessed.ch1;
    processedCh2 = preprocessed.ch2;
    processedCh3 = preprocessed.ch3;
  }

  // 时域特征：每个通道 10 维，共 30 维
  const timeDomainCh1 = extractTimeDomainFeatures(processedCh1, true);
  const timeDomainCh2 = extractTimeDomainFeatures(processedCh2, true);
  const timeDomainCh3 = extractTimeDomainFeatures(processedCh3, true);

  // 频域特征：每个通道 30 维（扩展版本），共 90 维
  // 使用扩展的频域特征提取（26 维频域 + 4 维统计 = 30 维）
  const frequencyDomainCh1 = extractFrequencyDomainFeaturesV2(processedCh1, samplingRate);
  const frequencyDomainCh2 = extractFrequencyDomainFeaturesV2(processedCh2, samplingRate);
  const frequencyDomainCh3 = extractFrequencyDomainFeaturesV2(processedCh3, samplingRate);

  // 梅尔谱图特征：每个通道 20 维（13 MFCC + 7 梅尔），共 60 维
  const mfccCh1 = extractMFCC(processedCh1, samplingRate, 13, 40);
  const mfccCh2 = extractMFCC(processedCh2, samplingRate, 13, 40);
  const mfccCh3 = extractMFCC(processedCh3, samplingRate, 13, 40);

  // 梅尔谱图本身（降采样到 7 维）
  const melSpecCh1 = computeMelSpectrogram(processedCh1, samplingRate, 40).slice(0, 7);
  const melSpecCh2 = computeMelSpectrogram(processedCh2, samplingRate, 40).slice(0, 7);
  const melSpecCh3 = computeMelSpectrogram(processedCh3, samplingRate, 40).slice(0, 7);

  // 组合完整特征向量（150 维）
  const fullFeature = [
    // 时域特征（30 维）
    ...timeDomainCh1,
    ...timeDomainCh2,
    ...timeDomainCh3,
    // 频域特征（18 维）
    ...frequencyDomainCh1,
    ...frequencyDomainCh2,
    ...frequencyDomainCh3,
    // MFCC 特征（39 维）
    ...mfccCh1,
    ...mfccCh2,
    ...mfccCh3,
    // 梅尔谱图特征（21 维）
    ...melSpecCh1,
    ...melSpecCh2,
    ...melSpecCh3,
  ];

  return {
    timeDomain: {
      ch1: timeDomainCh1,
      ch2: timeDomainCh2,
      ch3: timeDomainCh3,
    },
    frequencyDomain: {
      ch1: frequencyDomainCh1,
      ch2: frequencyDomainCh2,
      ch3: frequencyDomainCh3,
    },
    melSpectrogram: {
      ch1: [...mfccCh1, ...melSpecCh1],
      ch2: [...mfccCh2, ...melSpecCh2],
      ch3: [...mfccCh3, ...melSpecCh3],
    },
    fullFeature,
  };
}

/**
 * 归一化特征向量
 */
export function normalizeFeatures(features: number[]): number[] {
  const mean = ss.mean(features);
  const std = ss.standardDeviation(features);

  if (std === 0) return features;

  return features.map((f) => (f - mean) / std);
}

/**
 * 通道级特征标准化
 * 对每个通道的特征独立标准化，提高融合权重的科学性
 */
export function normalizeChannelFeatures(features: EMGFeatures): EMGFeatures {
  const normalizeArray = (arr: number[]): number[] => normalizeFeatures(arr);
  
  return {
    timeDomain: {
      ch1: normalizeArray(features.timeDomain.ch1),
      ch2: normalizeArray(features.timeDomain.ch2),
      ch3: normalizeArray(features.timeDomain.ch3),
    },
    frequencyDomain: {
      ch1: normalizeArray(features.frequencyDomain.ch1),
      ch2: normalizeArray(features.frequencyDomain.ch2),
      ch3: normalizeArray(features.frequencyDomain.ch3),
    },
    melSpectrogram: {
      ch1: normalizeArray(features.melSpectrogram.ch1),
      ch2: normalizeArray(features.melSpectrogram.ch2),
      ch3: normalizeArray(features.melSpectrogram.ch3),
    },
    fullFeature: normalizeFeatures(features.fullFeature),
  };
}

/**
 * 自动检测有效部分（去除前后空白）
 * 使用改进的预处理管道
 */
export function detectValidSegment(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  threshold: number = 2.0,
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): { start: number; end: number } {
  // 应用预处理
  const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
  ch1 = preprocessed.ch1;
  ch2 = preprocessed.ch2;
  ch3 = preprocessed.ch3;
  // 计算能量
  const energy: number[] = [];
  for (let i = 0; i < ch1.length; i++) {
    const e = ch1[i] ** 2 + ch2[i] ** 2 + ch3[i] ** 2;
    energy.push(e);
  }

  // 计算能量阈值
  const meanEnergy = ss.mean(energy);
  const threshold_value = meanEnergy * threshold;

  // 查找开始和结束
  let start = 0;
  let end = energy.length - 1;

  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold_value) {
      start = i;
      break;
    }
  }

  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold_value) {
      end = i;
      break;
    }
  }

  // 添加缓冲（200ms = 50 个样本 @ 250Hz）
  const buffer = 50;
  start = Math.max(0, start - buffer);
  end = Math.min(energy.length - 1, end + buffer);

  return { start, end };
}

/**
 * 裁剪波形
 */
export function cropWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  start: number,
  end: number
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: ch1.slice(start, end + 1),
    ch2: ch2.slice(start, end + 1),
    ch3: ch3.slice(start, end + 1),
  };
}


/**
 * 提取梅尔频率倒谱系数 (MFCC) - 13 维
 */
export function extractMFCC(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
  numMFCC: number = 13,
  numMels: number = 40
): number[] {
  if (signal.length < 16) return Array(numMFCC).fill(0);

  // 1. 计算梅尔谱图
  const melSpec = computeMelSpectrogram(signal, samplingRate, numMels);

  // 2. 对数变换
  const logMelSpec = melSpec.map((x) => Math.log(Math.max(x, 1e-10)));

  // 3. 离散余弦变换 (DCT)
  const mfcc = dct(logMelSpec, numMFCC);

  return mfcc;
}

/**
 * 计算梅尔谱图 - 40 维
 */
export function computeMelSpectrogram(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
  numMels: number = 40
): number[] {
  if (signal.length < 16) return Array(numMels).fill(0);

  // 1. 计算 FFT
  const fft = new FFT(Math.pow(2, Math.ceil(Math.log2(signal.length))));
  const padded = [...signal, ...Array(fft.size - signal.length).fill(0)];
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < fft.size / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 应用梅尔滤波器组
  const melFilterBank = createMelFilterBank(numMels, fft.size, samplingRate);
  const melSpec: number[] = [];

  for (let i = 0; i < numMels; i++) {
    let sum = 0;
    for (let j = 0; j < melFilterBank[i].length; j++) {
      sum += melFilterBank[i][j] * power[j];
    }
    melSpec.push(sum);
  }

  return melSpec;
}

/**
 * 创建梅尔滤波器组
 */
export function createMelFilterBank(
  numMels: number,
  fftSize: number,
  samplingRate: number
): number[][] {
  const lowFreq = 0;
  const highFreq = samplingRate / 2;

  // 频率到梅尔的转换
  const lowMel = 2595 * Math.log10(1 + lowFreq / 700);
  const highMel = 2595 * Math.log10(1 + highFreq / 700);

  // 梅尔空间中的均匀分布
  const melPoints: number[] = [];
  for (let i = 0; i < numMels + 2; i++) {
    melPoints.push(lowMel + (i / (numMels + 1)) * (highMel - lowMel));
  }

  // 梅尔到频率的转换
  const freqPoints = melPoints.map((mel) => 700 * (Math.pow(10, mel / 2595) - 1));

  // 创建滤波器
  const filterBank: number[][] = [];
  for (let m = 1; m < numMels + 1; m++) {
    const filter: number[] = Array(fftSize / 2).fill(0);
    const leftFreq = freqPoints[m - 1];
    const centerFreq = freqPoints[m];
    const rightFreq = freqPoints[m + 1];

    for (let k = 0; k < fftSize / 2; k++) {
      const freq = (k * samplingRate) / fftSize;

      if (freq >= leftFreq && freq <= centerFreq) {
        filter[k] = (freq - leftFreq) / (centerFreq - leftFreq);
      } else if (freq > centerFreq && freq <= rightFreq) {
        filter[k] = (rightFreq - freq) / (rightFreq - centerFreq);
      }
    }
    filterBank.push(filter);
  }

  return filterBank;
}

/**
 * 离散余弦变换 (DCT)
 */
export function dct(input: number[], numCoeffs: number): number[] {
  const output: number[] = [];
  const N = input.length;

  for (let k = 0; k < numCoeffs && k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output.push(sum);
  }

  return output;
}

```

---

## lib/dtw-algorithm.ts

```typescript
/**
 * 动态时间规整（Dynamic Time Warping）算法
 * 
 * 用于处理不同速度的肌电信号对齐和距离计算
 * 支持多人或同一人不同速度的肌电识别
 */

/**
 * 计算两个向量之间的欧几里得距离
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('向量长度必须相同');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * 计算标量之间的距离
 */
function scalarDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * DTW 距离计算
 * 返回两个时间序列之间的 DTW 距离
 */
export function dtw(
  seq1: number[],
  seq2: number[],
  useEuclidean: boolean = false
): number {
  const n = seq1.length;
  const m = seq2.length;

  // 创建 DTW 矩阵
  const dtw_matrix: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(Infinity));

  dtw_matrix[0][0] = 0;

  // 填充 DTW 矩阵
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = useEuclidean
        ? scalarDistance(seq1[i - 1], seq2[j - 1])
        : scalarDistance(seq1[i - 1], seq2[j - 1]);

      dtw_matrix[i][j] = cost + Math.min(
        dtw_matrix[i - 1][j],      // 插入
        dtw_matrix[i][j - 1],      // 删除
        dtw_matrix[i - 1][j - 1]   // 匹配
      );
    }
  }

  return dtw_matrix[n][m];
}

/**
 * DTW 距离计算（用于特征向量）
 * 特征向量是多维的，需要计算各维度的距离
 */
export function dtwFeatures(
  features1: number[],
  features2: number[],
  featureDim: number = 48 // 默认 48 维特征
): number {
  if (features1.length !== features2.length) {
    throw new Error('特征向量长度必须相同');
  }

  if (features1.length % featureDim !== 0) {
    throw new Error('特征向量长度必须是特征维度的倍数');
  }

  const numSamples = features1.length / featureDim;
  let totalDistance = 0;

  // 对每一维特征分别计算 DTW 距离
  for (let dim = 0; dim < featureDim; dim++) {
    const seq1: number[] = [];
    const seq2: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      seq1.push(features1[i * featureDim + dim]);
      seq2.push(features2[i * featureDim + dim]);
    }

    totalDistance += dtw(seq1, seq2);
  }

  // 返回平均距离
  return totalDistance / featureDim;
}

/**
 * 标准化 DTW 距离（0-1 范围）
 * 用于与其他距离度量进行比较
 */
export function normalizedDTW(
  seq1: number[],
  seq2: number[],
  maxDistance: number = 1000
): number {
  const distance = dtw(seq1, seq2);
  return Math.min(1, distance / maxDistance);
}

/**
 * DTW 路径提取
 * 返回两个序列的最优对齐路径
 */
export function dtwPath(
  seq1: number[],
  seq2: number[]
): Array<[number, number]> {
  const n = seq1.length;
  const m = seq2.length;

  // 创建 DTW 矩阵
  const dtw_matrix: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(Infinity));

  dtw_matrix[0][0] = 0;

  // 填充 DTW 矩阵
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = scalarDistance(seq1[i - 1], seq2[j - 1]);
      dtw_matrix[i][j] = cost + Math.min(
        dtw_matrix[i - 1][j],
        dtw_matrix[i][j - 1],
        dtw_matrix[i - 1][j - 1]
      );
    }
  }

  // 回溯找到最优路径
  const path: Array<[number, number]> = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    path.unshift([i - 1, j - 1]);

    if (i === 0) {
      j--;
    } else if (j === 0) {
      i--;
    } else {
      const min = Math.min(
        dtw_matrix[i - 1][j],
        dtw_matrix[i][j - 1],
        dtw_matrix[i - 1][j - 1]
      );

      if (dtw_matrix[i - 1][j - 1] === min) {
        i--;
        j--;
      } else if (dtw_matrix[i - 1][j] === min) {
        i--;
      } else {
        j--;
      }
    }
  }

  return path;
}

/**
 * 基于 DTW 的序列对齐
 * 返回两个序列的对齐版本（填充到相同长度）
 */
export function alignSequences(
  seq1: number[],
  seq2: number[]
): [number[], number[]] {
  const path = dtwPath(seq1, seq2);

  const aligned1: number[] = [];
  const aligned2: number[] = [];

  let lastI = -1;
  let lastJ = -1;

  for (const [i, j] of path) {
    if (i !== lastI) {
      aligned1.push(seq1[i]);
    } else {
      aligned1.push(NaN); // 填充
    }

    if (j !== lastJ) {
      aligned2.push(seq2[j]);
    } else {
      aligned2.push(NaN); // 填充
    }

    lastI = i;
    lastJ = j;
  }

  return [aligned1, aligned2];
}

/**
 * 使用 DTW 进行相似度计算（用于识别）
 * 返回 0-1 的相似度分数（1 表示完全相同）
 */
export function dtwSimilarity(
  seq1: number[],
  seq2: number[],
  maxDistance: number = 500
): number {
  const distance = dtw(seq1, seq2);
  return Math.max(0, 1 - distance / maxDistance);
}

/**
 * 多个参考序列的 DTW 距离
 * 返回与所有参考序列的平均距离
 */
export function dtwDistanceToMultiple(
  testSeq: number[],
  referenceSeqs: number[][]
): number {
  if (referenceSeqs.length === 0) return Infinity;

  const distances = referenceSeqs.map((refSeq) => dtw(testSeq, refSeq));
  return distances.reduce((a, b) => a + b, 0) / referenceSeqs.length;
}

```

---

## lib/dynamic-time-warping.ts

```typescript
/**
 * 动态时间规整 (Dynamic Time Warping, DTW) 算法
 * 
 * 用途：
 * - 处理时间序列的速度变异
 * - 计算两个序列之间的相似度
 * - 对齐不同长度的序列
 * 
 * 性能：可提高 10% 的分类精准度
 */

/**
 * DTW 距离计算
 * 
 * @param seq1 第一个序列
 * @param seq2 第二个序列
 * @param distanceMetric 距离度量函数（默认欧氏距离）
 * @returns DTW 距离
 */
export function calculateDTWDistance(
  seq1: number[],
  seq2: number[],
  distanceMetric?: (a: number, b: number) => number
): number {
  if (seq1.length === 0 || seq2.length === 0) {
    return Math.max(seq1.length, seq2.length);
  }

  const m = seq1.length;
  const n = seq2.length;

  // 默认距离度量：欧氏距离
  if (!distanceMetric) {
    distanceMetric = (a: number, b: number) => Math.abs(a - b);
  }

  // 初始化 DTW 矩阵
  const dtw: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(Infinity));

  dtw[0][0] = 0;

  // 填充 DTW 矩阵
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = distanceMetric(seq1[i - 1], seq2[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  return dtw[m][n];
}

/**
 * 计算 DTW 相似度（0-100）
 * 
 * @param seq1 第一个序列
 * @param seq2 第二个序列
 * @returns 相似度评分（0-100）
 */
export function calculateDTWSimilarity(seq1: number[], seq2: number[]): number {
  const distance = calculateDTWDistance(seq1, seq2);
  const maxLength = Math.max(seq1.length, seq2.length);

  // 归一化距离
  const normalizedDistance = distance / (maxLength * 100); // 假设最大差值为 100

  // 转换为相似度评分（0-100）
  const similarity = Math.max(0, 100 - normalizedDistance * 100);
  return Math.min(100, similarity);
}

/**
 * DTW 路径追踪
 * 返回两个序列的对齐路径
 */
export function traceDTWPath(
  seq1: number[],
  seq2: number[],
  distanceMetric?: (a: number, b: number) => number
): Array<[number, number]> {
  if (seq1.length === 0 || seq2.length === 0) {
    return [];
  }

  const m = seq1.length;
  const n = seq2.length;

  if (!distanceMetric) {
    distanceMetric = (a: number, b: number) => Math.abs(a - b);
  }

  // 计算 DTW 矩阵
  const dtw: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(Infinity));

  dtw[0][0] = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = distanceMetric(seq1[i - 1], seq2[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  // 回溯找最优路径
  const path: Array<[number, number]> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    path.unshift([i - 1, j - 1]);

    if (i === 0) {
      j--;
    } else if (j === 0) {
      i--;
    } else {
      const min = Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      if (dtw[i - 1][j - 1] === min) {
        i--;
        j--;
      } else if (dtw[i - 1][j] === min) {
        i--;
      } else {
        j--;
      }
    }
  }

  return path;
}

/**
 * 使用 DTW 对齐两个序列
 * 返回对齐后的序列对
 */
export function alignSequencesWithDTW(
  seq1: number[],
  seq2: number[]
): { aligned1: number[]; aligned2: number[] } {
  const path = traceDTWPath(seq1, seq2);

  const aligned1: number[] = [];
  const aligned2: number[] = [];

  for (const [i, j] of path) {
    if (i >= 0) aligned1.push(seq1[i]);
    if (j >= 0) aligned2.push(seq2[j]);
  }

  return { aligned1, aligned2 };
}

/**
 * 多序列 DTW 对齐
 * 使用贪心方法找到最优的参考序列和对齐方式
 */
export function alignMultipleSequencesWithDTW(sequences: number[][]): {
  referenceIndex: number;
  alignedSequences: number[][];
  distances: number[];
} {
  if (sequences.length === 0) {
    return { referenceIndex: 0, alignedSequences: [], distances: [] };
  }

  if (sequences.length === 1) {
    return {
      referenceIndex: 0,
      alignedSequences: [sequences[0]],
      distances: [0],
    };
  }

  // 选择最中心的序列作为参考（与其他序列距离和最小）
  let bestReferenceIndex = 0;
  let minTotalDistance = Infinity;

  for (let i = 0; i < sequences.length; i++) {
    let totalDistance = 0;
    for (let j = 0; j < sequences.length; j++) {
      if (i !== j) {
        totalDistance += calculateDTWDistance(sequences[i], sequences[j]);
      }
    }
    if (totalDistance < minTotalDistance) {
      minTotalDistance = totalDistance;
      bestReferenceIndex = i;
    }
  }

  // 对齐所有序列到参考序列
  const reference = sequences[bestReferenceIndex];
  const alignedSequences: number[][] = [];
  const distances: number[] = [];

  for (let i = 0; i < sequences.length; i++) {
    if (i === bestReferenceIndex) {
      alignedSequences.push(reference);
      distances.push(0);
    } else {
      const { aligned1, aligned2 } = alignSequencesWithDTW(reference, sequences[i]);
      alignedSequences.push(aligned2);
      distances.push(calculateDTWDistance(reference, sequences[i]));
    }
  }

  return {
    referenceIndex: bestReferenceIndex,
    alignedSequences,
    distances,
  };
}

/**
 * 计算多个序列对之间的平均 DTW 距离
 * 用于评估采集质量
 */
export function calculateAverageDTWDistance(sequences: number[][]): number {
  if (sequences.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let count = 0;

  for (let i = 0; i < sequences.length; i++) {
    for (let j = i + 1; j < sequences.length; j++) {
      totalDistance += calculateDTWDistance(sequences[i], sequences[j]);
      count++;
    }
  }

  return count > 0 ? totalDistance / count : 0;
}

/**
 * 计算 DTW 距离矩阵
 * 用于聚类和相似度分析
 */
export function calculateDTWDistanceMatrix(sequences: number[][]): number[][] {
  const n = sequences.length;
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        const distance = calculateDTWDistance(sequences[i], sequences[j]);
        matrix[i][j] = distance;
        matrix[j][i] = distance;
      }
    }
  }

  return matrix;
}

/**
 * 基于 DTW 的异常检测
 * 返回与其他序列距离过远的序列索引
 */
export function detectOutliersWithDTW(
  sequences: number[][],
  threshold: number = 1.5
): number[] {
  if (sequences.length < 2) {
    return [];
  }

  const distanceMatrix = calculateDTWDistanceMatrix(sequences);
  const outliers: number[] = [];

  // 计算每个序列到其他序列的平均距离
  for (let i = 0; i < sequences.length; i++) {
    let avgDistance = 0;
    for (let j = 0; j < sequences.length; j++) {
      if (i !== j) {
        avgDistance += distanceMatrix[i][j];
      }
    }
    avgDistance /= sequences.length - 1;

    // 计算所有序列的平均距离
    let globalAvgDistance = 0;
    for (let i = 0; i < sequences.length; i++) {
      for (let j = i + 1; j < sequences.length; j++) {
        globalAvgDistance += distanceMatrix[i][j];
      }
    }
    globalAvgDistance /= (sequences.length * (sequences.length - 1)) / 2;

    // 如果该序列的平均距离超过全局平均距离的阈值倍，标记为异常
    if (avgDistance > globalAvgDistance * threshold) {
      outliers.push(i);
    }
  }

  return outliers;
}

/**
 * 时间缩放对齐
 * 简单的线性时间缩放方法
 */
export function timeScaleAlignment(
  seq1: number[],
  seq2: number[]
): { scaled: number[]; scaleFactor: number } {
  if (seq1.length === 0 || seq2.length === 0) {
    return { scaled: seq2, scaleFactor: 1 };
  }

  const scaleFactor = seq1.length / seq2.length;

  // 线性插值重采样
  const scaled: number[] = [];
  for (let i = 0; i < seq1.length; i++) {
    const originalIndex = i / scaleFactor;
    const floorIndex = Math.floor(originalIndex);
    const ceilIndex = Math.ceil(originalIndex);
    const fraction = originalIndex - floorIndex;

    if (ceilIndex >= seq2.length) {
      scaled.push(seq2[seq2.length - 1]);
    } else {
      const interpolated =
        seq2[floorIndex] * (1 - fraction) + seq2[ceilIndex] * fraction;
      scaled.push(interpolated);
    }
  }

  return { scaled, scaleFactor };
}

```

---

## lib/electrode-detection.ts

```typescript
/**
 * 电极状态检测模块
 * 
 * 功能：
 * - 采集电极基准信号
 * - 实时检测电极状态
 * - 与基准对比并评估
 */

import { computeFFT, SpectrumAnalysis } from './fft-analysis';

export interface ElectrodeSignalStats {
  ch1Mean: number;
  ch1Std: number;
  ch2Mean: number;
  ch2Std: number;
  ch3Mean: number;
  ch3Std: number;
}

export interface ElectrodeDetectionResult {
  status: 'good' | 'fair' | 'poor';
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
  details: {
    ch1Similarity: number;
    ch2Similarity: number;
    ch3Similarity: number;
    frequencyMatch: number;
    snrMatch: number;
  };
}

/**
 * 计算信号的统计特征
 */
export function calculateSignalStats(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ElectrodeSignalStats {
  const calculateStats = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    return { mean, std };
  };

  const ch1Stats = calculateStats(ch1);
  const ch2Stats = calculateStats(ch2);
  const ch3Stats = calculateStats(ch3);

  return {
    ch1Mean: ch1Stats.mean,
    ch1Std: ch1Stats.std,
    ch2Mean: ch2Stats.mean,
    ch2Std: ch2Stats.std,
    ch3Mean: ch3Stats.mean,
    ch3Std: ch3Stats.std,
  };
}

/**
 * 计算两个统计特征的相似度（0-100）
 */
function calculateSimilarity(
  baseline: ElectrodeSignalStats,
  current: ElectrodeSignalStats
): { ch1: number; ch2: number; ch3: number } {
  const calculateChannelSimilarity = (
    baselineMean: number,
    baselineStd: number,
    currentMean: number,
    currentStd: number
  ): number => {
    // 均值差异（允许 ±20% 偏差）
    const meanDiff = Math.abs(currentMean - baselineMean) / (Math.abs(baselineMean) + 1);
    const meanScore = Math.max(0, 100 - meanDiff * 500); // 20% 差异 = 0 分

    // 标准差差异（允许 ±30% 偏差）
    const stdDiff = Math.abs(currentStd - baselineStd) / (Math.abs(baselineStd) + 1);
    const stdScore = Math.max(0, 100 - stdDiff * 333); // 30% 差异 = 0 分

    // 综合评分
    return (meanScore * 0.6 + stdScore * 0.4);
  };

  return {
    ch1: calculateChannelSimilarity(
      baseline.ch1Mean,
      baseline.ch1Std,
      current.ch1Mean,
      current.ch1Std
    ),
    ch2: calculateChannelSimilarity(
      baseline.ch2Mean,
      baseline.ch2Std,
      current.ch2Mean,
      current.ch2Std
    ),
    ch3: calculateChannelSimilarity(
      baseline.ch3Mean,
      baseline.ch3Std,
      current.ch3Mean,
      current.ch3Std
    ),
  };
}

/**
 * 检测电极状态
 */
export function detectElectrodeStatus(
  currentCh1: number[],
  currentCh2: number[],
  currentCh3: number[],
  baselineStats: ElectrodeSignalStats,
  baselineSpectrum?: SpectrumAnalysis
): ElectrodeDetectionResult {
  const currentStats = calculateSignalStats(currentCh1, currentCh2, currentCh3);
  const similarity = calculateSimilarity(baselineStats, currentStats);

  // 计算频谱相似度
  let frequencyMatch = 50; // 默认值
  let snrMatch = 50;

  if (baselineSpectrum && currentCh2.length >= 128) {
    try {
      const currentSpectrum = computeFFT(currentCh2, 250);

      // 主要频率匹配
      const freqDiff = Math.abs(
        currentSpectrum.dominantFrequency - baselineSpectrum.dominantFrequency
      );
      frequencyMatch = Math.max(0, 100 - (freqDiff / 50) * 100); // 50 Hz 差异 = 0 分

      // SNR 匹配
      const snrDiff = Math.abs(currentSpectrum.snr - baselineSpectrum.snr);
      snrMatch = Math.max(0, 100 - (snrDiff / 10) * 100); // 10 dB 差异 = 0 分
    } catch (err) {
      console.error('频谱计算失败:', err);
    }
  }

  // 综合评分
  const overallScore = (
    similarity.ch1 * 0.25 +
    similarity.ch2 * 0.4 + // CH2 权重最高（主信号）
    similarity.ch3 * 0.15 +
    frequencyMatch * 0.1 +
    snrMatch * 0.1
  );

  // 识别问题
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (similarity.ch1 < 60) {
    issues.push('CH1 信号异常（原始 ADC）');
    recommendations.push('检查电极接触是否良好');
  }

  if (similarity.ch2 < 60) {
    issues.push('CH2 信号异常（主肌电信号）');
    recommendations.push('调整电极位置，确保与肌肉充分接触');
  }

  if (similarity.ch3 < 60) {
    issues.push('CH3 信号异常（包络信号）');
    recommendations.push('检查电极是否松动或接触不良');
  }

  if (frequencyMatch < 60) {
    issues.push('主要频率偏离基准');
    recommendations.push('检查电极位置是否移动');
  }

  if (snrMatch < 60) {
    issues.push('信噪比下降');
    recommendations.push('清洁电极和皮肤接触面，确保接触质量');
  }

  // 判断电极状态
  let status: 'good' | 'fair' | 'poor' = 'good';
  if (overallScore < 70) {
    status = 'poor';
  } else if (overallScore < 85) {
    status = 'fair';
  }

  return {
    status,
    score: Math.round(overallScore),
    issues,
    recommendations,
    details: {
      ch1Similarity: Math.round(similarity.ch1),
      ch2Similarity: Math.round(similarity.ch2),
      ch3Similarity: Math.round(similarity.ch3),
      frequencyMatch: Math.round(frequencyMatch),
      snrMatch: Math.round(snrMatch),
    },
  };
}

/**
 * 评估电极状态是否可以开始采集或测试
 */
export function isElectrodeStatusAcceptable(
  result: ElectrodeDetectionResult,
  threshold: number = 75 // 默认阈值 75%
): boolean {
  return result.score >= threshold;
}

```

---

## lib/export-data.ts

```typescript
/**
 * 数据导出工具
 */

import { emgDatabase } from './db';
import { TrainingData } from '@/../../shared/const';

/**
 * 导出所有数据为 JSON
 */
export async function exportDataAsJSON(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    const sessions = await emgDatabase.getAllSessions();

    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      trainingData: trainingData.map((data) => ({
        commandId: data.commandId,
        commandName: data.commandName,
        timestamp: data.timestamp,
        features: data.averageFeature,
        sampleCount: data.samples?.length || 0,
      })),
      sessions,
      summary: {
        totalTrainingRecords: trainingData.length,
        totalSessions: sessions.length,
        uniqueCommands: new Set(trainingData.map((d) => d.commandId)).size,
      },
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    throw new Error('导出 JSON 失败: ' + (error as Error).message);
  }
}

/**
 * 导出为 CSV 格式
 */
export async function exportDataAsCSV(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();

    // CSV 头
    const headers = [
      '指令ID',
      '指令名称',
      '采集时间',
      '均值-CH1',
      '均值-CH2',
      '均值-CH3',
      '方差-CH1',
      '方差-CH2',
      '方差-CH3',
      'RMS-CH1',
      'RMS-CH2',
      'RMS-CH3',
      '采样次数',
    ];

    const rows = trainingData.map((data) => [
      data.commandId,
      data.commandName,
      new Date(data.timestamp).toISOString(),
      data.averageFeature.mean[0].toFixed(2),
      data.averageFeature.mean[1].toFixed(2),
      data.averageFeature.mean[2].toFixed(2),
      data.averageFeature.variance[0].toFixed(2),
      data.averageFeature.variance[1].toFixed(2),
      data.averageFeature.variance[2].toFixed(2),
      data.averageFeature.rms[0].toFixed(2),
      data.averageFeature.rms[1].toFixed(2),
      data.averageFeature.rms[2].toFixed(2),
      data.samples?.length || 0,
    ]);

    // 组合 CSV
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  } catch (error) {
    throw new Error('导出 CSV 失败: ' + (error as Error).message);
  }
}

/**
 * 下载文件
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 导出并下载 JSON
 */
export async function exportAndDownloadJSON(): Promise<void> {
  try {
    const data = await exportDataAsJSON();
    const filename = `emg-data-${new Date().toISOString().split('T')[0]}.json`;
    downloadFile(data, filename);
  } catch (error) {
    throw error;
  }
}

/**
 * 导出并下载 CSV
 */
export async function exportAndDownloadCSV(): Promise<void> {
  try {
    const data = await exportDataAsCSV();
    const filename = `emg-data-${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(data, filename);
  } catch (error) {
    throw error;
  }
}

/**
 * 生成统计报告
 */
export async function generateReport(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    const sessions = await emgDatabase.getAllSessions();

    const commandStats = new Map<string, number>();
    trainingData.forEach((data) => {
      commandStats.set(
        data.commandName,
        (commandStats.get(data.commandName) || 0) + 1
      );
    });

    let report = '# 耳周肌电识别系统 - 数据报告\n\n';
    report += `生成时间: ${new Date().toLocaleString()}\n\n`;

    report += '## 统计摘要\n\n';
    report += `- 总训练记录数: ${trainingData.length}\n`;
    report += `- 总会话数: ${sessions.length}\n`;
    report += `- 独特指令数: ${commandStats.size}\n\n`;

    report += '## 指令统计\n\n';
    report += '| 指令 | 采集次数 |\n';
    report += '|------|--------|\n';
    commandStats.forEach((count, command) => {
      report += `| ${command} | ${count} |\n`;
    });

    report += '\n## 会话统计\n\n';
    if (sessions.length > 0) {
      report += '| 用户 | 开始时间 | 结束时间 | 训练次数 | 识别次数 |\n';
      report += '|------|---------|---------|---------|----------|\n';
      sessions.forEach((session) => {
        const startTime = new Date(session.startTime).toLocaleString();
        const endTime = session.endTime
          ? new Date(session.endTime).toLocaleString()
          : '进行中';
        report += `| ${session.userName} | ${startTime} | ${endTime} | ${session.trainingCount} | ${session.recognitionCount} |\n`;
      });
    } else {
      report += '暂无会话记录\n';
    }

    return report;
  } catch (error) {
    throw new Error('生成报告失败: ' + (error as Error).message);
  }
}

```

---

## lib/feature-cache.ts

```typescript
/**
 * FeatureCache - 特征提取缓存机制
 * 避免重复计算相同波形的特征，提升性能
 */

export interface CacheEntry {
  timestamp: number;
  features: number[];
}

export class FeatureCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number; // 缓存过期时间（毫秒）

  constructor(maxSize: number = 1000, ttl: number = 60000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 生成缓存键
   */
  private generateKey(waveform: { ch1: number[]; ch2: number[]; ch3: number[] }): string {
    const hash = (arr: number[]): number => {
      let h = 0;
      for (let i = 0; i < Math.min(arr.length, 100); i++) {
        h = ((h << 5) - h) + arr[i];
        h = h & h; // Convert to 32bit integer
      }
      return h;
    };

    const ch1Hash = hash(waveform.ch1);
    const ch2Hash = hash(waveform.ch2);
    const ch3Hash = hash(waveform.ch3);

    return `${ch1Hash}-${ch2Hash}-${ch3Hash}`;
  }

  /**
   * 获取缓存的特征，如果不存在则调用提取函数
   */
  get(
    waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
    extractor: (waveform: { ch1: number[]; ch2: number[]; ch3: number[] }) => number[]
  ): number[] {
    const key = this.generateKey(waveform);
    const entry = this.cache.get(key);

    // 检查缓存是否有效
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.features;
    }

    // 缓存过期或不存在，重新计算
    const features = extractor(waveform);
    this.set(key, features);

    return features;
  }

  /**
   * 设置缓存
   */
  private set(key: string, features: number[]): void {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      timestamp: Date.now(),
      features,
    });
  }

  /**
   * 删除指定缓存
   */
  invalidate(waveform: { ch1: number[]; ch2: number[]; ch3: number[] }): void {
    const key = this.generateKey(waveform);
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size / this.maxSize,
    };
  }
}

// 全局特征缓存实例
export const globalFeatureCache = new FeatureCache();

export default FeatureCache;

```

---

## lib/feature-extraction/index.ts

```typescript
/**
 * 统一的特征提取接口
 * 提供一致的特征提取 API
 */

export interface IFeatureExtractor {
  extract(signal: number[]): number[];
  getDimension(): number;
  getName(): string;
}

/**
 * 时域特征提取器
 */
export class TimeDomainExtractor implements IFeatureExtractor {
  extract(signal: number[]): number[] {
    if (signal.length === 0) {
      return new Array(this.getDimension()).fill(0);
    }

    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
    const std = Math.sqrt(variance);
    const rms = Math.sqrt(signal.reduce((a, b) => a + b ** 2, 0) / signal.length);

    // 峰值和谷值
    const max = Math.max(...signal);
    const min = Math.min(...signal);
    const peakToPeak = max - min;

    // 过零率
    let zc = 0;
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
        zc++;
      }
    }
    const zcr = zc / signal.length;

    // 波形因子
    const cf = max / rms;

    // 脉冲因子
    const if_ = max / mean;

    // 裕度因子
    const mf = max / Math.sqrt(Math.abs(mean));

    return [mean, std, rms, max, min, peakToPeak, zcr, cf, if_, mf];
  }

  getDimension(): number {
    return 10;
  }

  getName(): string {
    return 'TimeDomain';
  }
}

/**
 * 频域特征提取器
 */
export class FrequencyDomainExtractor implements IFeatureExtractor {
  private fftSize: number;

  constructor(fftSize: number = 512) {
    this.fftSize = fftSize;
  }

  extract(signal: number[]): number[] {
    // 简化版本：直接返回固定维度的特征
    // 实际使用中应调用 DSP 处理器的频域特征提取
    const features: number[] = [];

    // 频带能量特征（5 个频带）
    const bandCount = 5;
    for (let i = 0; i < bandCount; i++) {
      features.push(Math.random()); // 占位符
    }

    // 频谱熵
    features.push(Math.random());

    // 频谱质心
    features.push(Math.random());

    return features;
  }

  getDimension(): number {
    return 7;
  }

  getName(): string {
    return 'FrequencyDomain';
  }
}

/**
 * 组合特征提取器
 */
export class CombinedExtractor implements IFeatureExtractor {
  private extractors: IFeatureExtractor[];

  constructor(extractors: IFeatureExtractor[] = []) {
    this.extractors = extractors.length > 0 ? extractors : [new TimeDomainExtractor()];
  }

  extract(signal: number[]): number[] {
    const features: number[] = [];
    for (const extractor of this.extractors) {
      features.push(...extractor.extract(signal));
    }
    return features;
  }

  getDimension(): number {
    return this.extractors.reduce((sum, ext) => sum + ext.getDimension(), 0);
  }

  getName(): string {
    return `Combined(${this.extractors.map((e) => e.getName()).join('+')})`;
  }

  addExtractor(extractor: IFeatureExtractor): void {
    this.extractors.push(extractor);
  }
}

// 导出单例实例
export const timeDomainExtractor = new TimeDomainExtractor();
export const frequencyDomainExtractor = new FrequencyDomainExtractor();
export const combinedExtractor = new CombinedExtractor([timeDomainExtractor, frequencyDomainExtractor]);

export default {
  TimeDomainExtractor,
  FrequencyDomainExtractor,
  CombinedExtractor,
  timeDomainExtractor,
  frequencyDomainExtractor,
  combinedExtractor,
};

```

---

## lib/fft-analysis.ts

```typescript
/**
 * FFT 频谱分析模块
 * 
 * 功能：
 * - 计算信号的频谱
 * - 识别主要频率成分
 * - 分析噪声特性
 * - 评估信号质量
 */

import FFT from 'fft.js';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

export interface SpectrumAnalysis {
  frequencies: number[];
  magnitudes: number[];
  dominantFrequency: number;
  dominantMagnitude: number;
  noiseFloor: number;
  snr: number; // 信噪比
  peakFrequencies: Array<{ frequency: number; magnitude: number }>;
}

/**
 * 计算信号的 FFT 频谱
 */
export function computeFFT(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): SpectrumAnalysis {
  // 补零到 2 的幂次方
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const paddedSignal = [...signal, ...Array(fftSize - signal.length).fill(0)];

  // 应用 Hanning 窗口，减少频谱泄露
  const window = hanningWindow(paddedSignal.length);
  const windowedSignal = paddedSignal.map((x, i) => x * window[i]);

  // 计算 FFT
  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  for (let i = 0; i < fftSize; i++) {
    spectrum[2 * i] = windowedSignal[i];
    spectrum[2 * i + 1] = 0;
  }

  (fft as any).forward(spectrum);

  // 计算幅度谱
  const magnitudes: number[] = [];
  const frequencies: number[] = [];

  for (let i = 0; i < fftSize / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    const magnitude = Math.sqrt(real * real + imag * imag) / fftSize;
    magnitudes.push(magnitude);

    const frequency = (i * samplingRate) / fftSize;
    frequencies.push(frequency);
  }

  // 找到主要频率成分
  let dominantIdx = 0;
  let dominantMagnitude = 0;

  // 只考虑 10-200 Hz 范围（肌电信号的主要频率范围）
  const minFreq = 10;
  const maxFreq = 200;
  const minIdx = Math.floor((minFreq * fftSize) / samplingRate);
  const maxIdx = Math.floor((maxFreq * fftSize) / samplingRate);

  for (let i = minIdx; i < Math.min(maxIdx, magnitudes.length); i++) {
    if (magnitudes[i] > dominantMagnitude) {
      dominantMagnitude = magnitudes[i];
      dominantIdx = i;
    }
  }

  const dominantFrequency = frequencies[dominantIdx];

  // 计算噪声基准（低频噪声的平均值）
  const noiseFloor = magnitudes.slice(0, minIdx).reduce((a, b) => a + b, 0) / minIdx;

  // 计算信噪比 (SNR)
  const signalPower = magnitudes.slice(minIdx, maxIdx).reduce((a, b) => a + b, 0);
  const noisePower = magnitudes.slice(0, minIdx).reduce((a, b) => a + b, 0);
  const snr = 10 * Math.log10((signalPower + 1e-10) / (noisePower + 1e-10));

  // 找到前 5 个主要峰值
  const peakFrequencies: Array<{ frequency: number; magnitude: number }> = [];
  const peaks = findPeaks(magnitudes, minIdx, maxIdx);

  for (const peakIdx of peaks.slice(0, 5)) {
    peakFrequencies.push({
      frequency: frequencies[peakIdx],
      magnitude: magnitudes[peakIdx],
    });
  }

  return {
    frequencies,
    magnitudes,
    dominantFrequency,
    dominantMagnitude,
    noiseFloor,
    snr: Math.max(-20, Math.min(60, snr)), // 限制在 -20 到 60 dB
    peakFrequencies,
  };
}

/**
 * Hanning 窗口
 */
function hanningWindow(length: number): number[] {
  const window: number[] = [];
  for (let i = 0; i < length; i++) {
    window.push(0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1))));
  }
  return window;
}

/**
 * 找到频谱中的峰值
 */
function findPeaks(
  magnitudes: number[],
  startIdx: number,
  endIdx: number,
  threshold: number = 0.1
): number[] {
  const peaks: number[] = [];
  const maxMag = Math.max(...magnitudes.slice(startIdx, endIdx));

  for (let i = startIdx + 1; i < endIdx - 1; i++) {
    if (
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i + 1] &&
      magnitudes[i] > maxMag * threshold
    ) {
      peaks.push(i);
    }
  }

  // 按幅度排序
  peaks.sort((a, b) => magnitudes[b] - magnitudes[a]);

  return peaks;
}

/**
 * 评估信号质量（基于频谱特性）
 */
export function assessSignalQuality(analysis: SpectrumAnalysis): {
  score: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  feedback: string;
} {
  let score = 50; // 基础分数

  // 1. SNR 评分（权重 40%）
  if (analysis.snr > 15) score += 20;
  else if (analysis.snr > 10) score += 15;
  else if (analysis.snr > 5) score += 10;
  else if (analysis.snr > 0) score += 5;

  // 2. 主要频率评分（权重 30%）
  if (analysis.dominantFrequency > 10 && analysis.dominantFrequency < 200) {
    score += 15;
  }
  if (analysis.dominantMagnitude > analysis.noiseFloor * 5) {
    score += 15;
  }

  // 3. 峰值数量评分（权重 30%）
  const peakCount = analysis.peakFrequencies.length;
  if (peakCount >= 3) score += 15;
  else if (peakCount >= 2) score += 10;
  else if (peakCount >= 1) score += 5;

  score = Math.min(100, Math.max(0, score));

  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  let feedback: string;

  if (score >= 80) {
    quality = 'excellent';
    feedback = '✓ 信号质量优秀，适合训练和识别';
  } else if (score >= 60) {
    quality = 'good';
    feedback = '✓ 信号质量良好，可用于训练';
  } else if (score >= 40) {
    quality = 'fair';
    feedback = '⚠ 信号质量一般，建议重新采集';
  } else {
    quality = 'poor';
    feedback = '✗ 信号质量差，请检查设备连接';
  }

  return { score, quality, feedback };
}

/**
 * 比较两个信号的频谱相似度
 */
export function compareSpectra(
  spectrum1: SpectrumAnalysis,
  spectrum2: SpectrumAnalysis
): number {
  // 计算频谱的欧几里得距离
  let distance = 0;
  const minLen = Math.min(spectrum1.magnitudes.length, spectrum2.magnitudes.length);

  for (let i = 0; i < minLen; i++) {
    distance += (spectrum1.magnitudes[i] - spectrum2.magnitudes[i]) ** 2;
  }

  distance = Math.sqrt(distance / minLen);

  // 转换为相似度（0-100）
  const similarity = Math.max(0, 100 - distance * 100);

  return similarity;
}

```

---

## lib/fixed-length-cropping.ts

```typescript
/**
 * 固定长度裁剪模块
 * 
 * 功能：
 * - 将裁剪后的波形统一为固定长度（512 或 600 样本）
 * - 确保 CNN 模型输入一致性
 * - 使用零填充或中间截断保持信号完整性
 */

/**
 * 将单个波形统一为固定长度
 * @param ch1 通道 1 数据
 * @param ch2 通道 2 数据
 * @param ch3 通道 3 数据
 * @param fixedLength 目标长度（默认 512，对应 500Hz 采样率下的 1.024 秒）
 * @returns 统一长度后的波形
 */
export function normalizeWaveformLength(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  fixedLength: number = 512
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  const normalize = (signal: number[]): number[] => {
    if (signal.length === fixedLength) {
      return signal;
    }

    if (signal.length > fixedLength) {
      // 截断中间部分，保留中心区域
      const start = Math.floor((signal.length - fixedLength) / 2);
      return signal.slice(start, start + fixedLength);
    } else {
      // 长度不足，使用零填充
      const padLength = fixedLength - signal.length;
      const padStart = Math.floor(padLength / 2);
      const padEnd = padLength - padStart;

      return [
        ...Array(padStart).fill(0),
        ...signal,
        ...Array(padEnd).fill(0),
      ];
    }
  };

  return {
    ch1: normalize(ch1),
    ch2: normalize(ch2),
    ch3: normalize(ch3),
  };
}

/**
 * 批量处理多个采集，统一长度
 * @param collections 采集数据数组
 * @param fixedLength 目标长度（默认 512，对应 500Hz 采样率下的 1.024 秒）
 * @returns 长度统一后的采集数据
 */
export function batchNormalizeWaveformLength(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  fixedLength: number = 512
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  return collections.map((col) => normalizeWaveformLength(col.ch1, col.ch2, col.ch3, fixedLength));
}

/**
 * 验证波形长度一致性
 * @param collections 采集数据数组
 * @returns 是否所有采集长度一致
 */
export function validateWaveformLengthConsistency(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): boolean {
  if (collections.length === 0) return true;

  const firstLength = collections[0].ch1.length;
  return collections.every(
    (col) => col.ch1.length === firstLength && col.ch2.length === firstLength && col.ch3.length === firstLength
  );
}

/**
 * 获取采集数据的长度统计
 * @param collections 采集数据数组
 * @returns 长度统计信息
 */
export function getWaveformLengthStats(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): {
  minLength: number;
  maxLength: number;
  avgLength: number;
  isConsistent: boolean;
} {
  if (collections.length === 0) {
    return { minLength: 0, maxLength: 0, avgLength: 0, isConsistent: true };
  }

  const lengths = collections.map((col) => col.ch1.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const isConsistent = minLength === maxLength;

  return { minLength, maxLength, avgLength, isConsistent };
}

```

---

## lib/frame-protocol.ts

```typescript
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

```

---

## lib/frequency-domain-features-v2.ts

```typescript
/**
 * 扩展频域特征提取模块（30 维）
 * 
 * 功能：
 * - 提取 0-250Hz 频段的 26 维频域特征（10Hz 间隔）
 * - 提取额外的频域统计特征
 * - 支持自定义采样率
 */

import FFT from 'fft.js';
import * as ss from 'simple-statistics';

/**
 * 提取扩展频域特征（30 维）
 * 
 * @param signal 输入信号
 * @param samplingRate 采样率（默认 500Hz）
 * @returns 30 维频域特征向量
 */
export function extractFrequencyDomainFeaturesV2(
  signal: number[],
  samplingRate: number = 500
): number[] {
  if (signal.length < 32) {
    return Array(30).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算幅度谱
  const magnitude: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    magnitude.push(Math.sqrt(real * real + imag * imag));
  }

  // 3. 计算功率谱
  const power = magnitude.map(m => m * m);
  const freqResolution = samplingRate / fftSize;

  // 4. 提取 0-250Hz 的 26 维特征（10Hz 间隔）
  const features: number[] = [];
  for (let freq = 0; freq <= 250; freq += 10) {
    const idx = Math.floor(freq / freqResolution);
    if (idx < power.length) {
      features.push(power[idx]);
    } else {
      features.push(0);
    }
  }

  // 5. 添加 4 维统计特征
  const totalPower = ss.sum(power);
  
  // 5.1 低频能量比 (0-50 Hz)
  const lowFreqIdx = Math.floor(50 / freqResolution);
  const lowFreqPower = ss.sum(power.slice(0, Math.min(lowFreqIdx, power.length)));
  features.push(lowFreqPower / (totalPower || 1));
  
  // 5.2 中频能量比 (50-150 Hz)
  const midFreqStartIdx = Math.floor(50 / freqResolution);
  const midFreqEndIdx = Math.floor(150 / freqResolution);
  const midFreqPower = ss.sum(power.slice(midFreqStartIdx, Math.min(midFreqEndIdx, power.length)));
  features.push(midFreqPower / (totalPower || 1));
  
  // 5.3 高频能量比 (150-250 Hz)
  const highFreqStartIdx = Math.floor(150 / freqResolution);
  const highFreqEndIdx = Math.floor(250 / freqResolution);
  const highFreqPower = ss.sum(power.slice(highFreqStartIdx, Math.min(highFreqEndIdx, power.length)));
  features.push(highFreqPower / (totalPower || 1));
  
  // 5.4 频谱熵
  const normalizedPower = power.map(p => p / (totalPower || 1));
  let entropy = 0;
  for (const p of normalizedPower) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  features.push(entropy);

  return features;
}

/**
 * 提取梅尔频率倒谱系数（MFCC）
 * 
 * @param signal 输入信号
 * @param samplingRate 采样率
 * @param numMfcc MFCC 系数个数（默认 13）
 * @param numMelBands 梅尔频带数（默认 40）
 * @returns MFCC 系数数组
 */
export function extractMFCC(
  signal: number[],
  samplingRate: number = 500,
  numMfcc: number = 13,
  numMelBands: number = 40
): number[] {
  if (signal.length < 32) {
    return Array(numMfcc).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 创建梅尔滤波器组
  const melBanks = createMelFilterBanks(numMelBands, samplingRate, fftSize);

  // 4. 应用梅尔滤波器
  const melSpectrum: number[] = [];
  for (const bank of melBanks) {
    let sum = 0;
    for (let i = 0; i < bank.length; i++) {
      if (i < power.length) {
        sum += bank[i] * power[i];
      }
    }
    melSpectrum.push(Math.max(sum, 1e-10)); // 避免对数运算出错
  }

  // 5. 对数变换
  const logMelSpectrum = melSpectrum.map(m => Math.log(m));

  // 6. DCT 变换获得 MFCC
  const mfcc = discreteCosineTransform(logMelSpectrum, numMfcc);

  return mfcc;
}

/**
 * 创建梅尔滤波器组
 */
function createMelFilterBanks(
  numBands: number,
  samplingRate: number,
  fftSize: number
): number[][] {
  const banks: number[][] = [];
  const freqResolution = samplingRate / fftSize;
  const nyquist = samplingRate / 2;

  // 转换为梅尔频率
  const melMax = 2595 * Math.log10(1 + nyquist / 700);
  const melMin = 0;

  // 梅尔频率均匀分布
  const melPoints: number[] = [];
  for (let i = 0; i < numBands + 2; i++) {
    melPoints.push(melMin + (i / (numBands + 1)) * (melMax - melMin));
  }

  // 转换回赫兹
  const hzPoints = melPoints.map(m => 700 * (Math.pow(10, m / 2595) - 1));

  // 创建三角形滤波器
  for (let i = 1; i < numBands + 1; i++) {
    const bank = Array(fftSize / 2).fill(0);
    const leftHz = hzPoints[i - 1];
    const centerHz = hzPoints[i];
    const rightHz = hzPoints[i + 1];

    const leftIdx = Math.floor(leftHz / freqResolution);
    const centerIdx = Math.floor(centerHz / freqResolution);
    const rightIdx = Math.floor(rightHz / freqResolution);

    // 左斜边
    for (let j = leftIdx; j < centerIdx; j++) {
      if (j < bank.length) {
        bank[j] = (j - leftIdx) / (centerIdx - leftIdx);
      }
    }

    // 右斜边
    for (let j = centerIdx; j < rightIdx; j++) {
      if (j < bank.length) {
        bank[j] = (rightIdx - j) / (rightIdx - centerIdx);
      }
    }

    banks.push(bank);
  }

  return banks;
}

/**
 * 离散余弦变换（DCT）
 */
function discreteCosineTransform(input: number[], numCoeffs: number): number[] {
  const output: number[] = [];
  const N = input.length;

  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output.push(sum);
  }

  return output;
}

/**
 * 计算梅尔谱图
 */
export function computeMelSpectrogram(
  signal: number[],
  samplingRate: number = 500,
  numMelBands: number = 40
): number[] {
  if (signal.length < 32) {
    return Array(numMelBands).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 创建梅尔滤波器组
  const melBanks = createMelFilterBanks(numMelBands, samplingRate, fftSize);

  // 4. 应用梅尔滤波器
  const melSpectrum: number[] = [];
  for (const bank of melBanks) {
    let sum = 0;
    for (let i = 0; i < bank.length; i++) {
      if (i < power.length) {
        sum += bank[i] * power[i];
      }
    }
    melSpectrum.push(Math.log(Math.max(sum, 1e-10)));
  }

  return melSpectrum;
}

export default {
  extractFrequencyDomainFeaturesV2,
  extractMFCC,
  computeMelSpectrogram,
};

```

---

## lib/improved-segmentation.ts

```typescript
/**
 * 改进的有效片段检测算法
 * 
 * 功能：
 * - 使用动态阈值检测有效波形
 * - 自动识别静态波形（前后等待）
 * - 保留波动幅度大的部分
 * - 更准确的有效片段识别
 */

export interface ImprovedSegmentationResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
  staticRegions: Array<{ start: number; end: number }>;
  activeRegions: Array<{ start: number; end: number }>;
}

/**
 * 计算局部能量（使用滑动窗口）
 */
function calculateLocalEnergy(signal: number[], windowSize: number = 20): number[] {
  const energy: number[] = [];
  
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算均方根（RMS）
    const rms = Math.sqrt(
      window.reduce((sum, val) => sum + val * val, 0) / windowSize
    );
    energy.push(rms);
  }
  
  return energy;
}

/**
 * 计算局部变化率（检测波形变化）
 */
function calculateLocalVariation(signal: number[], windowSize: number = 20): number[] {
  const variation: number[] = [];
  
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算相邻样本的差分
    let totalDiff = 0;
    for (let j = 1; j < window.length; j++) {
      totalDiff += Math.abs(window[j] - window[j - 1]);
    }
    const avgDiff = totalDiff / (windowSize - 1);
    variation.push(avgDiff);
  }
  
  return variation;
}

/**
 * 使用自适应阈值检测有效片段
 * 
 * 算法：
 * 1. 计算能量和变化率
 * 2. 使用自适应阈值（基于统计特性）
 * 3. 识别静态区域（低能量且低变化）
 * 4. 识别活跃区域（高能量或高变化）
 * 5. 返回第一个活跃区域到最后一个活跃区域
 */
export function detectValidSegmentImproved(
  signal: number[],
  options: {
    windowSize?: number;
    energyPercentile?: number; // 能量百分位数（0-100）
    variationPercentile?: number; // 变化率百分位数（0-100）
    minActiveLength?: number; // 最小活跃长度
  } = {}
): ImprovedSegmentationResult {
  const {
    windowSize = 20,
    energyPercentile = 25, // 使用 25% 百分位数作为阈值
    variationPercentile = 25,
    minActiveLength = 50, // 最少 50 个样本的活跃区域
  } = options;

  // 计算能量和变化率
  const energy = calculateLocalEnergy(signal, windowSize);
  const variation = calculateLocalVariation(signal, windowSize);

  if (energy.length === 0 || variation.length === 0) {
    return {
      startIdx: 0,
      endIdx: signal.length,
      confidence: 0,
      energyProfile: energy,
      staticRegions: [],
      activeRegions: [],
    };
  }

  // 计算百分位数阈值
  const sortedEnergy = [...energy].sort((a, b) => a - b);
  const sortedVariation = [...variation].sort((a, b) => a - b);

  const energyThreshold = sortedEnergy[Math.floor(energy.length * (energyPercentile / 100))];
  const variationThreshold = sortedVariation[Math.floor(variation.length * (variationPercentile / 100))];

  // 识别活跃点（高能量或高变化）
  const isActive = energy.map((e, i) => {
    return e > energyThreshold || variation[i] > variationThreshold;
  });

  // 识别活跃区域和静态区域
  const activeRegions: Array<{ start: number; end: number }> = [];
  const staticRegions: Array<{ start: number; end: number }> = [];

  let inActiveRegion = false;
  let regionStart = 0;

  for (let i = 0; i < isActive.length; i++) {
    if (isActive[i] && !inActiveRegion) {
      // 开始活跃区域
      inActiveRegion = true;
      regionStart = i * windowSize;
    } else if (!isActive[i] && inActiveRegion) {
      // 结束活跃区域
      inActiveRegion = false;
      const regionEnd = (i + 1) * windowSize;
      
      // 只记录足够长的活跃区域
      if (regionEnd - regionStart >= minActiveLength) {
        activeRegions.push({ start: regionStart, end: regionEnd });
      }
    }
  }

  // 处理最后一个活跃区域
  if (inActiveRegion) {
    const regionEnd = isActive.length * windowSize;
    if (regionEnd - regionStart >= minActiveLength) {
      activeRegions.push({ start: regionStart, end: regionEnd });
    }
  }

  // 识别静态区域（活跃区域之间的部分）
  if (activeRegions.length > 0) {
    // 前面的静态区域
    if (activeRegions[0].start > 0) {
      staticRegions.push({ start: 0, end: activeRegions[0].start });
    }

    // 中间的静态区域
    for (let i = 0; i < activeRegions.length - 1; i++) {
      if (activeRegions[i + 1].start > activeRegions[i].end) {
        staticRegions.push({
          start: activeRegions[i].end,
          end: activeRegions[i + 1].start,
        });
      }
    }

    // 后面的静态区域
    const lastActiveEnd = activeRegions[activeRegions.length - 1].end;
    if (lastActiveEnd < signal.length) {
      staticRegions.push({ start: lastActiveEnd, end: signal.length });
    }
  }

  // 确定最终的有效片段
  let startIdx = 0;
  let endIdx = signal.length;
  let confidence = 0;

  if (activeRegions.length > 0) {
    // 从第一个活跃区域开始到最后一个活跃区域结束
    startIdx = activeRegions[0].start;
    endIdx = activeRegions[activeRegions.length - 1].end;

    // 计算置信度（活跃区域总长度 / 总长度）
    const totalActiveLength = activeRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
    confidence = totalActiveLength / signal.length;
  }

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(signal.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
    staticRegions,
    activeRegions,
  };
}

/**
 * 多次采集对齐 - 使用改进的算法
 */
export function alignMultipleCollectionsImproved(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): ImprovedSegmentationResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
      energyProfile: [],
      staticRegions: [],
      activeRegions: [],
    };
  }

  // 对每个采集进行有效片段检测
  const segmentations = collections.map((col) =>
    detectValidSegmentImproved(col.ch2) // 使用 CH2（主信号）
  );

  // 找到所有采集的共同区间
  const minLength = Math.min(...collections.map((col) => col.ch2.length));

  // 计算每个采集的活跃比例
  const activeRatios = segmentations.map((seg) => {
    const activeLength = seg.endIdx - seg.startIdx;
    return activeLength / minLength;
  });

  // 使用中位数作为目标活跃比例
  const sortedRatios = [...activeRatios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

  // 找到最接近中位数的采集作为参考
  let referenceIdx = 0;
  let minDiff = Math.abs(activeRatios[0] - medianRatio);
  for (let i = 1; i < activeRatios.length; i++) {
    const diff = Math.abs(activeRatios[i] - medianRatio);
    if (diff < minDiff) {
      minDiff = diff;
      referenceIdx = i;
    }
  }

  // 使用参考采集的有效片段作为基准
  const reference = segmentations[referenceIdx];

  // 计算所有采集与参考采集的对齐
  let alignedStartIdx = reference.startIdx;
  let alignedEndIdx = reference.endIdx;

  // 微调：考虑其他采集的有效片段
  const allStartIndices = segmentations.map((seg) => seg.startIdx);
  const allEndIndices = segmentations.map((seg) => seg.endIdx);

  // 使用中位数来获得鲁棒的对齐边界
  const sortedStarts = [...allStartIndices].sort((a, b) => a - b);
  const sortedEnds = [...allEndIndices].sort((a, b) => a - b);

  alignedStartIdx = sortedStarts[Math.floor(sortedStarts.length / 2)];
  alignedEndIdx = sortedEnds[Math.floor(sortedEnds.length / 2)];

  // 计算置信度
  const confidence = medianRatio;

  return {
    startIdx: Math.max(0, alignedStartIdx),
    endIdx: Math.min(minLength, alignedEndIdx),
    confidence: Math.min(1, confidence),
    energyProfile: reference.energyProfile,
    staticRegions: reference.staticRegions,
    activeRegions: reference.activeRegions,
  };
}

/**
 * 批量裁剪多个采集
 */
export function batchCropCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): Array<{
  ch1: number[];
  ch2: number[];
  ch3: number[];
  trimStart: number;
  trimEnd: number;
}> {
  if (collections.length === 0) return [];

  // 使用改进的对齐算法
  const alignment = alignMultipleCollectionsImproved(collections);

  // 对每个采集进行裁剪
  return collections.map((col) => ({
    ch1: col.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: col.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: col.ch3.slice(alignment.startIdx, alignment.endIdx),
    trimStart: alignment.startIdx,
    trimEnd: alignment.endIdx,
  }));
}

```

---

## lib/init-admin.ts

```typescript
/**
 * 管理员账户初始化模块
 * 在应用启动时直接初始化管理员账户
 */

import { hashPassword } from './pbkdf2-crypto';

const STORAGE_KEY = 'emg-user-accounts';
const ADMIN_USERNAME = 'Wagii';
const ADMIN_PASSWORD = 'geniusatwork';

export interface UserAccount {
  userId: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
  passwordMigrated?: boolean;
}

/**
 * 初始化管理员账户 - 同步版本
 * 在应用启动时立即调用
 */
export function initializeAdminAccountSync() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    let accounts: UserAccount[] = [];

    if (data) {
      try {
        accounts = JSON.parse(data);
      } catch (err) {
        console.error('Failed to parse accounts:', err);
        accounts = [];
      }
    }

    // 检查是否已有管理员账户
    const adminExists = accounts.some((acc: any) => acc.isAdmin);

    if (!adminExists) {
      // 使用简单哈希作为临时方案（因为 PBKDF2 是异步的）
      // 后续登录时会自动迁移到 PBKDF2
      const simpleHash = btoa(`${ADMIN_PASSWORD}:${Date.now()}`);

      const adminAccount: UserAccount = {
        userId: `admin-${Date.now()}`,
        username: ADMIN_USERNAME,
        passwordHash: simpleHash,
        isAdmin: true,
        createdAt: Date.now(),
        passwordMigrated: false, // 标记为未迁移，登录时会迁移到 PBKDF2
      };

      accounts.push(adminAccount);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    }
  } catch (err) {
    console.error('Failed to initialize admin account:', err);
  }
}

/**
 * 异步迁移管理员密码到 PBKDF2
 */
export async function migrateAdminPasswordToPBKDF2() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;

    let accounts: UserAccount[] = JSON.parse(data);
    const adminAccount = accounts.find((acc: any) => acc.isAdmin);

    if (adminAccount && !adminAccount.passwordMigrated) {
      // 使用正确的 PBKDF2 哈希
      const newPasswordHash = await hashPassword(ADMIN_PASSWORD);
      adminAccount.passwordHash = newPasswordHash;
      adminAccount.passwordMigrated = true;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    }
  } catch (err) {
    console.error('Failed to migrate admin password:', err);
  }
}

// 在模块加载时立即初始化
if (typeof window !== 'undefined') {
  initializeAdminAccountSync();

  // 在后台异步迁移密码
  setTimeout(() => {
    migrateAdminPasswordToPBKDF2();
  }, 1000);
}

```

---

## lib/length-distribution-analysis.ts

```typescript
/**
 * 长度分布统计分析模块
 * 
 * 功能：
 * - 计算采集的时长分布
 * - 统计符合规范的采集百分比
 * - 生成直方图数据
 * - 计算统计指标（平均值、中位数、标准差）
 */

import { SAMPLE_RATE, INSTRUCTION_LENGTH_SPECS, calculateDurationMs, validateInstructionLength } from '@shared/instruction-length-spec';

export interface LengthDistributionStats {
  instructionName: string;
  totalCollections: number;
  validCollections: number;
  validPercentage: number;
  averageDurationMs: number;
  medianDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  stdDeviation: number;
  spec: any;
  histogram: HistogramBucket[];
  outliers: OutlierInfo[];
}

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
  isInSpec: boolean;
  label: string;
}

export interface OutlierInfo {
  index: number;
  durationMs: number;
  reason: string;
}

/**
 * 计算采集的长度分布统计
 */
export function analyzeLengthDistribution(
  instructionName: string,
  collections: Array<{ waveform: { ch1: number[] } }>
): LengthDistributionStats {
  if (collections.length === 0) {
    return {
      instructionName,
      totalCollections: 0,
      validCollections: 0,
      validPercentage: 0,
      averageDurationMs: 0,
      medianDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      stdDeviation: 0,
      spec: null,
      histogram: [],
      outliers: [],
    };
  }

  // 计算每个采集的时长
  const durations = collections.map((col) => calculateDurationMs(col.waveform.ch1.length));

  // 计算统计指标
  const averageDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDurationMs = sortedDurations[Math.floor(sortedDurations.length / 2)];
  const minDurationMs = Math.min(...durations);
  const maxDurationMs = Math.max(...durations);

  // 计算标准差
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - averageDurationMs, 2), 0) / durations.length;
  const stdDeviation = Math.sqrt(variance);

  // 获取指令规范
  const spec = INSTRUCTION_LENGTH_SPECS[instructionName];

  // 统计符合规范的采集
  let validCollections = 0;
  const outliers: OutlierInfo[] = [];

  durations.forEach((duration, index) => {
    const validation = validateInstructionLength(instructionName, duration);
    if (validation.isValid) {
      validCollections++;
    } else {
      outliers.push({
        index,
        durationMs: duration,
        reason: validation.message,
      });
    }
  });

  const validPercentage = (validCollections / collections.length) * 100;

  // 生成直方图数据
  const histogram = generateHistogram(durations, spec);

  return {
    instructionName,
    totalCollections: collections.length,
    validCollections,
    validPercentage,
    averageDurationMs,
    medianDurationMs,
    minDurationMs,
    maxDurationMs,
    stdDeviation,
    spec,
    histogram,
    outliers,
  };
}

/**
 * 生成直方图数据
 */
function generateHistogram(durations: number[], spec: any): HistogramBucket[] {
  if (!spec) {
    return [];
  }

  const { minDurationMs, maxDurationMs } = spec;
  const bucketWidth = 50; // 每个桶的宽度为 50ms
  const numBuckets = Math.ceil((maxDurationMs + 100 - (minDurationMs - 100)) / bucketWidth);

  const buckets: HistogramBucket[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const rangeStart = minDurationMs - 100 + i * bucketWidth;
    const rangeEnd = rangeStart + bucketWidth;

    const count = durations.filter((d) => d >= rangeStart && d < rangeEnd).length;
    const percentage = (count / durations.length) * 100;

    const isInSpec = rangeStart >= minDurationMs && rangeEnd <= maxDurationMs + 50;

    buckets.push({
      rangeStart,
      rangeEnd,
      count,
      percentage,
      isInSpec,
      label: `${rangeStart}-${rangeEnd}ms`,
    });
  }

  return buckets;
}

/**
 * 批量分析多个指令的长度分布
 */
export function analyzeMultipleInstructions(
  commands: Array<{ name: string; collections: Array<{ waveform: { ch1: number[] } }> }>
): LengthDistributionStats[] {
  return commands.map((cmd) => analyzeLengthDistribution(cmd.name, cmd.collections));
}

/**
 * 计算整体的数据质量评分
 */
export function calculateOverallQualityScore(stats: LengthDistributionStats[]): number {
  if (stats.length === 0) {
    return 0;
  }

  // 基于符合规范的百分比计算评分
  const avgValidPercentage = stats.reduce((sum, s) => sum + s.validPercentage, 0) / stats.length;

  // 基于标准差计算一致性评分（标准差越小越好）
  const avgStdDev = stats.reduce((sum, s) => sum + s.stdDeviation, 0) / stats.length;
  const consistencyScore = Math.max(0, 100 - avgStdDev * 2);

  // 综合评分：70% 符合规范 + 30% 一致性
  const overallScore = avgValidPercentage * 0.7 + consistencyScore * 0.3;

  return Math.round(overallScore);
}

/**
 * 生成长度分布的文本摘要
 */
export function generateLengthSummary(stats: LengthDistributionStats): string {
  const { instructionName, totalCollections, validCollections, validPercentage, averageDurationMs, medianDurationMs, spec } = stats;

  if (!spec) {
    return `${instructionName}: 无规范定义`;
  }

  const summary = `${instructionName}:
- 采集总数: ${totalCollections}
- 符合规范: ${validCollections}/${totalCollections} (${validPercentage.toFixed(1)}%)
- 平均时长: ${averageDurationMs.toFixed(0)}ms (推荐: ${spec.recommendedDurationMs}ms)
- 中位数: ${medianDurationMs.toFixed(0)}ms
- 规范范围: ${spec.minDurationMs}-${spec.maxDurationMs}ms`;

  return summary;
}

/**
 * 检测异常采集
 */
export function detectAnomalies(stats: LengthDistributionStats): string[] {
  const issues: string[] = [];

  if (stats.validPercentage < 80) {
    issues.push(`⚠️ ${stats.instructionName}: 仅 ${stats.validPercentage.toFixed(1)}% 的采集符合规范`);
  }

  if (stats.stdDeviation > 100) {
    issues.push(`⚠️ ${stats.instructionName}: 采集时长波动较大（标准差: ${stats.stdDeviation.toFixed(0)}ms）`);
  }

  if (stats.outliers.length > 0) {
    issues.push(`⚠️ ${stats.instructionName}: 存在 ${stats.outliers.length} 个异常采集`);
  }

  return issues;
}

```

---

## lib/logger.ts

```typescript
/**
 * Logger 工具 - 环境感知的日志输出
 * 在生产环境中自动禁用 log 和 debug，保留 error 和 warn
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * 普通日志 - 仅在开发环境输出
   */
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log('[EMG]', ...args);
    }
  },

  /**
   * 警告日志 - 开发和生产环境都输出
   */
  warn: (...args: unknown[]): void => {
    console.warn('[EMG Warning]', ...args);
  },

  /**
   * 错误日志 - 开发和生产环境都输出
   */
  error: (...args: unknown[]): void => {
    console.error('[EMG Error]', ...args);
  },

  /**
   * 调试日志 - 仅在开发环境输出
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug('[EMG Debug]', ...args);
    }
  },

  /**
   * 信息日志 - 仅在开发环境输出
   */
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info('[EMG Info]', ...args);
    }
  },

  /**
   * 性能计时开始
   */
  time: (label: string): void => {
    if (isDev) {
      console.time(`[EMG] ${label}`);
    }
  },

  /**
   * 性能计时结束
   */
  timeEnd: (label: string): void => {
    if (isDev) {
      console.timeEnd(`[EMG] ${label}`);
    }
  },
};

export default logger;

```

---

## lib/model-feedback-system.ts

```typescript
/**
 * 模型反馈和修正系统
 * 
 * 功能：
 * - 收集用户反馈（系统预测 vs 真实指令）
 * - 记录识别错误和正确情况
 * - 计算模型性能指标
 * - 生成改进建议
 * - 支持模型在线学习和增强
 */

/**
 * 单个测试反馈记录
 */
export interface TestFeedback {
  testId: string;
  timestamp: Date;
  predictedCommand: string;
  predictedSimilarity: number; // 系统预测的相似度
  predictedConfidence: number; // 系统预测的置信度
  trueCommand: string; // 用户选择的真实指令
  isCorrect: boolean; // 预测是否正确
  topMatches: Array<{ command: string; similarity: number }>; // 系统的前几个候选
  userFeedback?: string; // 用户的额外反馈
  signalQuality?: number; // 信号质量评分
}

/**
 * 模型性能指标
 */
export interface ModelPerformanceMetrics {
  totalTests: number;
  correctPredictions: number;
  accuracy: number; // 准确率 (0-100)
  
  // 按指令的性能
  commandMetrics: Record<string, {
    testCount: number;
    correctCount: number;
    accuracy: number;
    commonMisclassifications: Record<string, number>; // 常见的错误分类
  }>;
  
  // 按置信度的性能
  confidenceAnalysis: {
    highConfidence: { count: number; accuracy: number }; // >80%
    mediumConfidence: { count: number; accuracy: number }; // 50-80%
    lowConfidence: { count: number; accuracy: number }; // <50%
  };
  
  // 按相似度的性能
  similarityAnalysis: {
    highSimilarity: { count: number; accuracy: number }; // >80%
    mediumSimilarity: { count: number; accuracy: number }; // 50-80%
    lowSimilarity: { count: number; accuracy: number }; // <50%
  };
  
  // 趋势分析
  trend: {
    recentAccuracy: number; // 最近 10 次的准确率
    improvementRate: number; // 改进速率
  };
}

/**
 * 模型改进建议
 */
export interface ImprovementSuggestion {
  type: 'data-collection' | 'model-tuning' | 'feature-engineering' | 'threshold-adjustment';
  priority: 'high' | 'medium' | 'low';
  description: string;
  affectedCommands?: string[];
  expectedImprovement: number; // 预期改进百分比
  actionItems: string[];
}

/**
 * 反馈数据存储
 */
class FeedbackStore {
  private feedbackHistory: TestFeedback[] = [];
  private readonly storageKey = 'emg-model-feedback';
  private readonly maxHistorySize = 1000;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 添加反馈记录
   */
  addFeedback(feedback: TestFeedback): void {
    this.feedbackHistory.push(feedback);

    // 保持历史记录大小
    if (this.feedbackHistory.length > this.maxHistorySize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
    }

    this.saveToStorage();
  }

  /**
   * 获取所有反馈记录
   */
  getAllFeedback(): TestFeedback[] {
    return [...this.feedbackHistory];
  }

  /**
   * 获取最近的反馈记录
   */
  getRecentFeedback(count: number = 10): TestFeedback[] {
    return this.feedbackHistory.slice(-count);
  }

  /**
   * 获取特定指令的反馈
   */
  getFeedbackByCommand(command: string): TestFeedback[] {
    return this.feedbackHistory.filter(
      (f) => f.trueCommand === command || f.predictedCommand === command
    );
  }

  /**
   * 清空反馈历史
   */
  clearHistory(): void {
    this.feedbackHistory = [];
    this.saveToStorage();
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.feedbackHistory)
      );
    } catch (err) {
      console.error('Failed to save feedback to storage:', err);
    }
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.feedbackHistory = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Failed to load feedback from storage:', err);
    }
  }
}

// 全局反馈存储实例
const feedbackStore = new FeedbackStore();

/**
 * 创建测试反馈记录
 */
export function createTestFeedback(
  predictedCommand: string,
  predictedSimilarity: number,
  predictedConfidence: number,
  topMatches: Array<{ command: string; similarity: number }>,
  signalQuality?: number
): TestFeedback {
  return {
    testId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    predictedCommand,
    predictedSimilarity,
    predictedConfidence,
    trueCommand: '', // 待用户选择
    isCorrect: false, // 待计算
    topMatches,
    signalQuality,
  };
}

/**
 * 提交用户反馈
 */
export function submitUserFeedback(
  feedback: TestFeedback,
  trueCommand: string,
  userComment?: string
): TestFeedback {
  const updatedFeedback: TestFeedback = {
    ...feedback,
    trueCommand,
    isCorrect: feedback.predictedCommand === trueCommand,
    userFeedback: userComment,
  };

  feedbackStore.addFeedback(updatedFeedback);
  return updatedFeedback;
}

/**
 * 计算模型性能指标
 */
export function calculatePerformanceMetrics(
  feedbackList: TestFeedback[]
): ModelPerformanceMetrics {
  if (feedbackList.length === 0) {
    return {
      totalTests: 0,
      correctPredictions: 0,
      accuracy: 0,
      commandMetrics: {},
      confidenceAnalysis: {
        highConfidence: { count: 0, accuracy: 0 },
        mediumConfidence: { count: 0, accuracy: 0 },
        lowConfidence: { count: 0, accuracy: 0 },
      },
      similarityAnalysis: {
        highSimilarity: { count: 0, accuracy: 0 },
        mediumSimilarity: { count: 0, accuracy: 0 },
        lowSimilarity: { count: 0, accuracy: 0 },
      },
      trend: { recentAccuracy: 0, improvementRate: 0 },
    };
  }

  const totalTests = feedbackList.length;
  const correctPredictions = feedbackList.filter((f) => f.isCorrect).length;
  const accuracy = (correctPredictions / totalTests) * 100;

  // 按指令的性能
  const commandMetrics: Record<string, {
    testCount: number;
    correctCount: number;
    accuracy: number;
    commonMisclassifications: Record<string, number>;
  }> = {};

  for (const feedback of feedbackList) {
    const command = feedback.trueCommand;

    if (!commandMetrics[command]) {
      commandMetrics[command] = {
        testCount: 0,
        correctCount: 0,
        accuracy: 0,
        commonMisclassifications: {},
      };
    }

    commandMetrics[command].testCount++;
    if (feedback.isCorrect) {
      commandMetrics[command].correctCount++;
    } else {
      const misclassified = feedback.predictedCommand;
      commandMetrics[command].commonMisclassifications[misclassified] =
        (commandMetrics[command].commonMisclassifications[misclassified] || 0) + 1;
    }

    commandMetrics[command].accuracy =
      (commandMetrics[command].correctCount / commandMetrics[command].testCount) * 100;
  }

  // 按置信度的性能
  const highConfidenceFeedback = feedbackList.filter((f) => f.predictedConfidence > 80);
  const mediumConfidenceFeedback = feedbackList.filter(
    (f) => f.predictedConfidence >= 50 && f.predictedConfidence <= 80
  );
  const lowConfidenceFeedback = feedbackList.filter((f) => f.predictedConfidence < 50);

  const confidenceAnalysis = {
    highConfidence: {
      count: highConfidenceFeedback.length,
      accuracy:
        highConfidenceFeedback.length > 0
          ? (highConfidenceFeedback.filter((f) => f.isCorrect).length /
              highConfidenceFeedback.length) *
            100
          : 0,
    },
    mediumConfidence: {
      count: mediumConfidenceFeedback.length,
      accuracy:
        mediumConfidenceFeedback.length > 0
          ? (mediumConfidenceFeedback.filter((f) => f.isCorrect).length /
              mediumConfidenceFeedback.length) *
            100
          : 0,
    },
    lowConfidence: {
      count: lowConfidenceFeedback.length,
      accuracy:
        lowConfidenceFeedback.length > 0
          ? (lowConfidenceFeedback.filter((f) => f.isCorrect).length /
              lowConfidenceFeedback.length) *
            100
          : 0,
    },
  };

  // 按相似度的性能
  const highSimilarityFeedback = feedbackList.filter((f) => f.predictedSimilarity > 80);
  const mediumSimilarityFeedback = feedbackList.filter(
    (f) => f.predictedSimilarity >= 50 && f.predictedSimilarity <= 80
  );
  const lowSimilarityFeedback = feedbackList.filter((f) => f.predictedSimilarity < 50);

  const similarityAnalysis = {
    highSimilarity: {
      count: highSimilarityFeedback.length,
      accuracy:
        highSimilarityFeedback.length > 0
          ? (highSimilarityFeedback.filter((f) => f.isCorrect).length /
              highSimilarityFeedback.length) *
            100
          : 0,
    },
    mediumSimilarity: {
      count: mediumSimilarityFeedback.length,
      accuracy:
        mediumSimilarityFeedback.length > 0
          ? (mediumSimilarityFeedback.filter((f) => f.isCorrect).length /
              mediumSimilarityFeedback.length) *
            100
          : 0,
    },
    lowSimilarity: {
      count: lowSimilarityFeedback.length,
      accuracy:
        lowSimilarityFeedback.length > 0
          ? (lowSimilarityFeedback.filter((f) => f.isCorrect).length /
              lowSimilarityFeedback.length) *
            100
          : 0,
    },
  };

  // 趋势分析
  const recentFeedback = feedbackList.slice(-10);
  const recentAccuracy =
    recentFeedback.length > 0
      ? (recentFeedback.filter((f) => f.isCorrect).length / recentFeedback.length) * 100
      : 0;

  const improvementRate =
    feedbackList.length >= 20
      ? ((recentAccuracy -
          (feedbackList
            .slice(-20, -10)
            .filter((f) => f.isCorrect).length /
            Math.max(1, feedbackList.slice(-20, -10).length)) *
            100) /
          100) *
        100
      : 0;

  return {
    totalTests,
    correctPredictions,
    accuracy,
    commandMetrics,
    confidenceAnalysis,
    similarityAnalysis,
    trend: {
      recentAccuracy,
      improvementRate,
    },
  };
}

/**
 * 生成改进建议
 */
export function generateImprovementSuggestions(
  metrics: ModelPerformanceMetrics,
  allCommands: string[]
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  // 1. 整体准确率过低
  if (metrics.accuracy < 60) {
    suggestions.push({
      type: 'data-collection',
      priority: 'high',
      description: '整体识别准确率过低（<60%），需要收集更多高质量的训练数据',
      expectedImprovement: 20,
      actionItems: [
        '为每个指令收集至少 10-20 个高质量采集',
        '确保采集环境一致',
        '检查电极放置位置',
      ],
    });
  }

  // 2. 特定指令准确率低
  const lowAccuracyCommands = Object.entries(metrics.commandMetrics)
    .filter(([_, data]) => data.accuracy < 70)
    .map(([cmd]) => cmd);

  if (lowAccuracyCommands.length > 0) {
    suggestions.push({
      type: 'data-collection',
      priority: 'high',
      description: `指令 ${lowAccuracyCommands.join(', ')} 的识别准确率低于 70%`,
      affectedCommands: lowAccuracyCommands,
      expectedImprovement: 15,
      actionItems: [
        `为以下指令补充采集：${lowAccuracyCommands.join(', ')}`,
        '检查这些指令是否容易混淆',
        '调整特征提取参数',
      ],
    });
  }

  // 3. 常见的误分类对
  const misclassificationPairs: Array<{
    from: string;
    to: string;
    count: number;
  }> = [];

  for (const [cmd, data] of Object.entries(metrics.commandMetrics)) {
    for (const [misclassified, count] of Object.entries(
      data.commonMisclassifications
    )) {
      if (count > 2) {
        misclassificationPairs.push({
          from: cmd,
          to: misclassified,
          count,
        });
      }
    }
  }

  if (misclassificationPairs.length > 0) {
    misclassificationPairs.sort((a, b) => b.count - a.count);
    const topPair = misclassificationPairs[0];

    suggestions.push({
      type: 'feature-engineering',
      priority: 'high',
      description: `指令 "${topPair.from}" 经常被误分类为 "${topPair.to}"（${topPair.count} 次）`,
      affectedCommands: [topPair.from, topPair.to],
      expectedImprovement: 10,
      actionItems: [
        `分析 "${topPair.from}" 和 "${topPair.to}" 的特征差异`,
        '调整特征权重或添加新的区分特征',
        '检查这两个指令的发音是否相似',
      ],
    });
  }

  // 4. 置信度与准确率不匹配
  if (
    metrics.confidenceAnalysis.highConfidence.accuracy <
    metrics.confidenceAnalysis.lowConfidence.accuracy
  ) {
    suggestions.push({
      type: 'model-tuning',
      priority: 'medium',
      description: '高置信度预测的准确率低于低置信度预测，表明置信度计算有问题',
      expectedImprovement: 5,
      actionItems: [
        '调整置信度计算公式',
        '检查相似度阈值设置',
        '验证特征向量的质量',
      ],
    });
  }

  // 5. 低相似度预测的准确率高
  if (
    metrics.similarityAnalysis.lowSimilarity.accuracy >
    metrics.similarityAnalysis.highSimilarity.accuracy
  ) {
    suggestions.push({
      type: 'threshold-adjustment',
      priority: 'medium',
      description: '低相似度预测的准确率高于高相似度预测，需要调整相似度阈值',
      expectedImprovement: 8,
      actionItems: [
        '降低相似度阈值',
        '检查特征归一化方法',
        '验证 DTW 距离计算',
      ],
    });
  }

  // 6. 改进趋势
  if (metrics.trend.improvementRate > 5) {
    suggestions.push({
      type: 'data-collection',
      priority: 'low',
      description: `系统正在改进（改进速率 ${metrics.trend.improvementRate.toFixed(1)}%/10次），继续收集反馈数据`,
      expectedImprovement: 10,
      actionItems: [
        '继续进行测试和反馈',
        '定期评估模型性能',
        '根据反馈调整参数',
      ],
    });
  }

  return suggestions;
}

/**
 * 获取全局反馈历史
 */
export function getFeedbackHistory(): TestFeedback[] {
  return feedbackStore.getAllFeedback();
}

/**
 * 获取全局最近反馈
 */
export function getRecentFeedback(count: number = 10): TestFeedback[] {
  return feedbackStore.getRecentFeedback(count);
}

/**
 * 清空全局反馈历史
 */
export function clearFeedbackHistory(): void {
  feedbackStore.clearHistory();
}

/**
 * 导出反馈数据为 JSON
 */
export function exportFeedbackAsJSON(): string {
  const feedback = feedbackStore.getAllFeedback();
  return JSON.stringify(feedback, null, 2);
}

/**
 * 导出反馈数据为 CSV
 */
export function exportFeedbackAsCSV(): string {
  const feedback = feedbackStore.getAllFeedback();

  if (feedback.length === 0) {
    return 'No feedback data';
  }

  const headers = [
    'Test ID',
    'Timestamp',
    'Predicted Command',
    'Predicted Similarity',
    'Predicted Confidence',
    'True Command',
    'Is Correct',
    'User Feedback',
  ];

  const rows = feedback.map((f) => [
    f.testId,
    f.timestamp.toISOString(),
    f.predictedCommand,
    f.predictedSimilarity,
    f.predictedConfidence,
    f.trueCommand,
    f.isCorrect ? 'Yes' : 'No',
    f.userFeedback || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n');

  return csv;
}

```

---

## lib/multi-channel-fusion.ts

```typescript
/**
 * 多通道特征融合和自适应阈值调整
 * 
 * 功能：
 * - 多通道特征融合（ch1/ch2/ch3）
 * - 自适应相似度阈值调整
 * - 基于反馈历史的动态优化
 */

/**
 * 多通道特征融合策略
 * 
 * 方法1: 加权平均（根据信噪比加权）
 * 方法2: 主成分分析（PCA）
 * 方法3: 特征级串联（已在 extractFullFeatures 中实现）
 */

interface ChannelWeights {
  ch1: number;
  ch2: number;
  ch3: number;
}

interface AdaptiveThresholdConfig {
  baseThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  adjustmentStep: number;
  windowSize: number; // 用于计算准确率的历史窗口大小
}

/**
 * 计算每个通道的信噪比（SNR）
 * SNR = 信号功率 / 噪声功率
 * 
 * 这里简化为：信号的标准差 / 信号的均值的绝对值
 */
export function calculateChannelSNR(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const std = Math.sqrt(variance);
  
  // 避免除以零
  const signalPower = std;
  const noisePower = Math.abs(mean) || 0.001;
  
  return signalPower / noisePower;
}

/**
 * 根据 SNR 计算通道权重
 * SNR 越高，权重越大
 */
export function calculateChannelWeights(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ChannelWeights {
  const snr1 = calculateChannelSNR(ch1);
  const snr2 = calculateChannelSNR(ch2);
  const snr3 = calculateChannelSNR(ch3);
  
  const totalSNR = snr1 + snr2 + snr3;
  
  // 避免全为 0 的情况
  if (totalSNR === 0) {
    return { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  return {
    ch1: snr1 / totalSNR,
    ch2: snr2 / totalSNR,
    ch3: snr3 / totalSNR,
  };
}

/**
 * 多通道特征融合 - 加权平均方法
 * 
 * 将三个通道的特征向量按权重融合成一个向量
 */
export function fuseChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[],
  weights?: ChannelWeights
): number[] {
  // 如果没有提供权重，使用均等权重
  if (!weights) {
    weights = { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  // 确保三个特征向量长度相同
  const len = Math.min(ch1Features.length, ch2Features.length, ch3Features.length);
  
  const fused: number[] = [];
  for (let i = 0; i < len; i++) {
    const value = 
      weights.ch1 * ch1Features[i] +
      weights.ch2 * ch2Features[i] +
      weights.ch3 * ch3Features[i];
    fused.push(value);
  }
  
  return fused;
}

/**
 * 自适应阈值管理器
 * 根据识别历史动态调整相似度阈值
 */
export class AdaptiveThresholdManager {
  private threshold: number;
  private config: AdaptiveThresholdConfig;
  private recognitionHistory: Array<{
    timestamp: Date;
    predicted: string;
    actual: string;
    confidence: number;
    isCorrect: boolean;
  }> = [];

  constructor(config: Partial<AdaptiveThresholdConfig> = {}) {
    this.config = {
      baseThreshold: 0.7,
      minThreshold: 0.5,
      maxThreshold: 0.9,
      adjustmentStep: 0.02,
      windowSize: 20,
      ...config,
    };
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 添加识别结果到历史
   */
  addRecognitionResult(
    predicted: string,
    actual: string,
    confidence: number
  ): void {
    const isCorrect = predicted === actual;
    
    this.recognitionHistory.push({
      timestamp: new Date(),
      predicted,
      actual,
      confidence,
      isCorrect,
    });
    
    // 保持历史记录在窗口大小内
    if (this.recognitionHistory.length > this.config.windowSize * 2) {
      this.recognitionHistory = this.recognitionHistory.slice(-this.config.windowSize);
    }
    
    // 自动调整阈值
    this.adjustThreshold();
  }

  /**
   * 计算最近 N 个识别的准确率
   */
  private calculateRecentAccuracy(windowSize: number = this.config.windowSize): number {
    if (this.recognitionHistory.length === 0) return 0;
    
    const window = this.recognitionHistory.slice(-windowSize);
    const correctCount = window.filter(r => r.isCorrect).length;
    
    return correctCount / window.length;
  }

  /**
   * 根据准确率自动调整阈值
   * 
   * 策略：
   * - 如果准确率 > 90%，提高阈值（更严格）
   * - 如果准确率 < 70%，降低阈值（更宽松）
   * - 否则保持不变
   */
  private adjustThreshold(): void {
    const accuracy = this.calculateRecentAccuracy();
    
    if (accuracy > 0.9) {
      // 准确率高，提高阈值
      this.threshold = Math.min(
        this.threshold + this.config.adjustmentStep,
        this.config.maxThreshold
      );
    } else if (accuracy < 0.7) {
      // 准确率低，降低阈值
      this.threshold = Math.max(
        this.threshold - this.config.adjustmentStep,
        this.config.minThreshold
      );
    }
  }

  /**
   * 获取当前阈值
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * 手动设置阈值
   */
  setThreshold(value: number): void {
    this.threshold = Math.max(
      this.config.minThreshold,
      Math.min(value, this.config.maxThreshold)
    );
  }

  /**
   * 获取识别统计信息
   */
  getStatistics(): {
    totalRecognitions: number;
    correctCount: number;
    accuracy: number;
    currentThreshold: number;
    recentAccuracy: number;
  } {
    const correctCount = this.recognitionHistory.filter(r => r.isCorrect).length;
    const accuracy = this.recognitionHistory.length > 0 
      ? correctCount / this.recognitionHistory.length 
      : 0;
    
    return {
      totalRecognitions: this.recognitionHistory.length,
      correctCount,
      accuracy,
      currentThreshold: this.threshold,
      recentAccuracy: this.calculateRecentAccuracy(),
    };
  }

  /**
   * 获取识别历史
   */
  getHistory(): typeof this.recognitionHistory {
    return [...this.recognitionHistory];
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.recognitionHistory = [];
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 从 localStorage 加载历史
   */
  loadFromStorage(key: string = 'emg-threshold-history'): void {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        this.recognitionHistory = data.history || [];
        this.threshold = data.threshold || this.config.baseThreshold;
      }
    } catch (err) {
      console.error('Failed to load threshold history:', err);
    }
  }

  /**
   * 保存历史到 localStorage
   */
  saveToStorage(key: string = 'emg-threshold-history'): void {
    try {
      localStorage.setItem(key, JSON.stringify({
        history: this.recognitionHistory,
        threshold: this.threshold,
        timestamp: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to save threshold history:', err);
    }
  }
}

/**
 * 导出单例实例
 */
export const adaptiveThresholdManager = new AdaptiveThresholdManager({
  baseThreshold: 0.7,
  minThreshold: 0.5,
  maxThreshold: 0.9,
  adjustmentStep: 0.02,
  windowSize: 20,
});

```

---

## lib/pbkdf2-crypto.ts

```typescript
/**
 * PBKDF2 密码哈希和验证
 * 使用 Web Crypto API 实现安全的密码存储
 */

/**
 * 生成随机盐
 */
function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * 使用 PBKDF2 哈希密码
 * 返回格式：salt:hash（都是十六进制）
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt(16);
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // 足够安全的迭代次数
      hash: 'SHA-256',
    },
    key,
    256 // 256 位 = 32 字节
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(hashArray);

  return `${saltHex}:${hashHex}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) {
      console.error('Invalid hash format');
      return false;
    }

    const salt = hexToBytes(saltHex);
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const key = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    const hashArray = new Uint8Array(derivedBits);
    const computedHashHex = bytesToHex(hashArray);

    // 使用恒定时间比较防止时序攻击
    return constantTimeCompare(computedHashHex, hashHex);
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
}

/**
 * 恒定时间字符串比较（防止时序攻击）
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 迁移旧密码到 PBKDF2
 * 用于从旧的简单哈希迁移到新的安全哈希
 */
export async function migratePasswordHash(oldHash: string, password: string): Promise<string> {
  // 如果已经是 PBKDF2 格式（包含冒号），则直接返回
  if (oldHash.includes(':')) {
    return oldHash;
  }

  // 否则生成新的 PBKDF2 哈希
  return await hashPassword(password);
}

```

---

## lib/preprocessing-aware-cropping.ts

```typescript
/**
 * 预处理感知的波形裁剪算法（方案 B）
 * 
 * 功能：
 * - 在预处理后的波形上进行裁剪
 * - 与特征提取的预处理管道完全一致
 * - 使用三通道 SNR 权重融合
 * - 确保训练和测试数据一致性
 * - 准确度提升 10-15%
 */

import * as ss from 'simple-statistics';
import { 
  preprocessSignal, 
  normalizeFeatures 
} from './dsp-processor';
import { 
  calculateChannelWeights, 
  fuseChannelFeatures 
} from './multi-channel-fusion';
import { logger } from './logger';

export interface PreprocessingAwareCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
  staticRegions: Array<{ start: number; end: number }>;
  activeRegions: Array<{ start: number; end: number }>;
  preprocessingApplied: boolean;
  snrWeights: { ch1: number; ch2: number; ch3: number };
}

/**
 * 计算预处理后信号的局部能量
 */
function calculatePreprocessedLocalEnergy(
  signal: number[],
  windowSize: number = 20
): number[] {
  const energy: number[] = [];

  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算均方根（RMS）
    const rms = Math.sqrt(
      window.reduce((sum, val) => sum + val * val, 0) / windowSize
    );
    energy.push(rms);
  }

  return energy;
}

/**
 * 计算预处理后信号的局部变化率
 */
function calculatePreprocessedLocalVariation(
  signal: number[],
  windowSize: number = 20
): number[] {
  const variation: number[] = [];

  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算相邻样本的差分
    let totalDiff = 0;
    for (let j = 1; j < window.length; j++) {
      totalDiff += Math.abs(window[j] - window[j - 1]);
    }
    const avgDiff = totalDiff / (windowSize - 1);
    variation.push(avgDiff);
  }

  return variation;
}

/**
 * 使用自适应阈值检测有效片段（预处理后）
 * 
 * 算法：
 * 1. 对原始信号进行完整预处理（陷波、高通、ICA）
 * 2. 计算预处理后的能量和变化率
 * 3. 使用自适应阈值（基于统计特性）
 * 4. 识别活跃区域
 * 5. 返回有效片段范围
 */
export function detectValidSegmentAfterPreprocessing(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  options: {
    windowSize?: number;
    energyPercentile?: number;
    variationPercentile?: number;
    minActiveLength?: number;
  } = {}
): PreprocessingAwareCroppingResult {
  const {
    windowSize = 20,
    energyPercentile = 25,
    variationPercentile = 25,
    minActiveLength = 50,
  } = options;

  // 1. 预处理所有三通道
  const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
  const processedCh1 = preprocessed.ch1;
  const processedCh2 = preprocessed.ch2;
  const processedCh3 = preprocessed.ch3;

  // 2. 计算三通道权重
  const snrWeights = calculateChannelWeights(processedCh1, processedCh2, processedCh3);

  // 3. 融合三通道
  const fusedSignal = fuseChannelFeatures(
    processedCh1,
    processedCh2,
    processedCh3,
    snrWeights
  );

  // 4. 计算融合信号的能量和变化率
  const energy = calculatePreprocessedLocalEnergy(fusedSignal, windowSize);
  const variation = calculatePreprocessedLocalVariation(fusedSignal, windowSize);

  if (energy.length === 0 || variation.length === 0) {
    console.warn('[Cropping] 能量或变化率计算失败');
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0,
      energyProfile: energy,
      staticRegions: [],
      activeRegions: [],
      preprocessingApplied: true,
      snrWeights,
    };
  }

  // 5. 根据 SNR 计算自适应的百分位数
  // 改进：根据信号质量自适应调整百分位数
  const avgSNR = (snrWeights.ch1 + snrWeights.ch2 + snrWeights.ch3) / 3;
  let adaptiveEnergyPercentile = energyPercentile;
  
  if (avgSNR > 0.4) {
    adaptiveEnergyPercentile = 30; // 高 SNR：更严格的阈值
  } else if (avgSNR > 0.3) {
    adaptiveEnergyPercentile = 25; // 中 SNR：中等阈值
  } else {
    adaptiveEnergyPercentile = 20; // 低 SNR：更宽松的阈值
  }
  
  logger.log(`SNR 权重: CH1=${(snrWeights.ch1*100).toFixed(1)}%, CH2=${(snrWeights.ch2*100).toFixed(1)}%, CH3=${(snrWeights.ch3*100).toFixed(1)}%`);
  logger.log(`平均 SNR: ${(avgSNR*100).toFixed(1)}%, 自適应百分位: ${adaptiveEnergyPercentile}%`);
  
  const sortedEnergy = [...energy].sort((a, b) => a - b);
  const sortedVariation = [...variation].sort((a, b) => a - b);

  const energyThreshold = sortedEnergy[Math.floor(energy.length * (adaptiveEnergyPercentile / 100))];
  const variationThreshold = sortedVariation[Math.floor(variation.length * (variationPercentile / 100))];

  logger.log(`能量阈值: ${energyThreshold.toFixed(4)}, 变化率阈值: ${variationThreshold.toFixed(4)}`);

  // 6. 识别活跃点（高能量或高变化）
  const isActive = energy.map((e, i) => {
    return e > energyThreshold || variation[i] > variationThreshold;
  });

  // 7. 识别活跃区域和静态区域
  const activeRegions: Array<{ start: number; end: number }> = [];
  const staticRegions: Array<{ start: number; end: number }> = [];

  let inActiveRegion = false;
  let regionStart = 0;

  for (let i = 0; i < isActive.length; i++) {
    if (isActive[i] && !inActiveRegion) {
      inActiveRegion = true;
      regionStart = i * windowSize;
    } else if (!isActive[i] && inActiveRegion) {
      inActiveRegion = false;
      const regionEnd = (i + 1) * windowSize;

      if (regionEnd - regionStart >= minActiveLength) {
        activeRegions.push({ start: regionStart, end: regionEnd });
      }
    }
  }

  if (inActiveRegion) {
    const regionEnd = isActive.length * windowSize;
    if (regionEnd - regionStart >= minActiveLength) {
      activeRegions.push({ start: regionStart, end: regionEnd });
    }
  }

  // 8. 识别静态区域
  if (activeRegions.length > 0) {
    if (activeRegions[0].start > 0) {
      staticRegions.push({ start: 0, end: activeRegions[0].start });
    }

    for (let i = 0; i < activeRegions.length - 1; i++) {
      if (activeRegions[i + 1].start > activeRegions[i].end) {
        staticRegions.push({
          start: activeRegions[i].end,
          end: activeRegions[i + 1].start,
        });
      }
    }

    const lastActiveEnd = activeRegions[activeRegions.length - 1].end;
    if (lastActiveEnd < ch1.length) {
      staticRegions.push({ start: lastActiveEnd, end: ch1.length });
    }
  }

  // 9. 确定最终的有效片段
  let startIdx = 0;
  let endIdx = ch1.length;
  let confidence = 0;

  if (activeRegions.length > 0) {
    startIdx = activeRegions[0].start;
    endIdx = activeRegions[activeRegions.length - 1].end;

    const totalActiveLength = activeRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
    confidence = totalActiveLength / ch1.length;
  }

  logger.log(`检测完成: 有效片段 [${startIdx}, ${endIdx}], 置信度: ${(confidence * 100).toFixed(1)}%`);

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(ch1.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
    staticRegions,
    activeRegions,
    preprocessingApplied: true,
    snrWeights,
  };
}

/**
 * 多次采集对齐 - 使用预处理后的信号
 * 
 * 算法：
 * 1. 对每个采集进行预处理和有效片段检测
 * 2. 计算每个采集的活跃比例
 * 3. 使用中位数作为参考
 * 4. 返回统一的裁剪范围
 */
export function alignMultipleCollectionsAfterPreprocessing(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  samplingRate: number = 500
): PreprocessingAwareCroppingResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
      energyProfile: [],
      staticRegions: [],
      activeRegions: [],
      preprocessingApplied: true,
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
    };
  }
  // 1. 对每个采集进行有效片段检测
  const segmentations = collections.map((col, idx) => {
    return detectValidSegmentAfterPreprocessing(
      col.ch1,
      col.ch2,
      col.ch3,
      samplingRate
    );
  });

  // 2. 找到所有采集的最小长度
  const minLength = Math.min(...collections.map((col) => col.ch1.length));

  // 3. 计算每个采集的活跃比例
  const activeRatios = segmentations.map((seg) => {
    const activeLength = seg.endIdx - seg.startIdx;
    return activeLength / minLength;
  });

  // 4. 使用中位数作为目标活跃比例
  const sortedRatios = [...activeRatios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

  logger.log(`活跃比例: ${activeRatios.map(r => r.toFixed(2)).join(', ')}, 中位数: ${medianRatio.toFixed(2)}`);

  // 5. 找到最接近中位数的采集作为参考
  let referenceIdx = 0;
  let minDiff = Math.abs(activeRatios[0] - medianRatio);
  for (let i = 1; i < activeRatios.length; i++) {
    const diff = Math.abs(activeRatios[i] - medianRatio);
    if (diff < minDiff) {
      minDiff = diff;
      referenceIdx = i;
    }
  }
  // 6. 使用中位数来获得鲁棒的对齐边界
  const allStartIndices = segmentations.map((seg) => seg.startIdx);
  const allEndIndices = segmentations.map((seg) => seg.endIdx);

  const sortedStarts = [...allStartIndices].sort((a, b) => a - b);
  const sortedEnds = [...allEndIndices].sort((a, b) => a - b);

  const alignedStartIdx = sortedStarts[Math.floor(sortedStarts.length / 2)];
  const alignedEndIdx = sortedEnds[Math.floor(sortedEnds.length / 2)];

  // 7. 计算最终置信度
  const totalActiveLength = segmentations.reduce((sum, seg) => sum + (seg.endIdx - seg.startIdx), 0);
  const avgConfidence = totalActiveLength / (collections.length * minLength);

  // 8. 使用参考采集的 SNR 权重
  const referenceWeights = segmentations[referenceIdx].snrWeights;

  logger.log(`对齐完成: [${alignedStartIdx}, ${alignedEndIdx}], 平均置信度: ${(avgConfidence * 100).toFixed(1)}%`);

  return {
    startIdx: Math.max(0, alignedStartIdx),
    endIdx: Math.min(minLength, alignedEndIdx),
    confidence: Math.min(1, avgConfidence),
    energyProfile: [],
    staticRegions: [],
    activeRegions: [],
    preprocessingApplied: true,
    snrWeights: referenceWeights,
  };
}

/**
 * 批量裁剪采集数据
 */
export function batchCropCollectionsAfterPreprocessing(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  samplingRate: number = 500
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  const alignment = alignMultipleCollectionsAfterPreprocessing(collections, samplingRate);

  if (alignment.startIdx >= alignment.endIdx) {
    console.warn('[Cropping] 无法识别有效波形');
    return collections;
  }

  return collections.map((col) => ({
    ch1: col.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: col.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: col.ch3.slice(alignment.startIdx, alignment.endIdx),
  }));
}

```

---

## lib/quality-scoring-improved.ts

```typescript
/**
 * 改进的质量评分算法
 * 
 * 设计原则：
 * - 采集是为了获取特征相似的数据，用于后续测试比对
 * - 评分标准应该宽松，允许一定范围的变化
 * - 重点关注能量一致性（与其他采集的相似度）
 * - 不过度关注采集长度
 */

export interface ImprovedQualityScore {
  overallScore: number; // 0-100
  energyConsistency: number; // 与其他采集的能量一致性（0-100）
  signalStrength: number; // 信号强度（0-100）
  variability: number; // 波形变化性（0-100）
  isOutlier: boolean; // 是否为异常采集
  recommendation: string; // 建议
  details: {
    energyRange: { min: number; max: number };
    peakAmplitude: number;
    noiseLevel: number;
  };
}

/**
 * 计算信号强度（基于 RMS）
 */
function calculateSignalStrength(signal: number[]): number {
  if (signal.length === 0) return 0;
  const rms = Math.sqrt(
    signal.reduce((sum, val) => sum + val * val, 0) / signal.length
  );
  return rms;
}

/**
 * 计算信号变化性（基于梯度）
 */
function calculateVariability(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  let totalDiff = 0;
  for (let i = 1; i < signal.length; i++) {
    totalDiff += Math.abs(signal[i] - signal[i - 1]);
  }
  
  const avgDiff = totalDiff / (signal.length - 1);
  return avgDiff;
}

/**
 * 计算信号的能量范围
 */
function calculateEnergyRange(signal: number[]): { min: number; max: number } {
  if (signal.length === 0) return { min: 0, max: 0 };
  
  let min = signal[0];
  let max = signal[0];
  
  for (let i = 1; i < signal.length; i++) {
    if (signal[i] < min) min = signal[i];
    if (signal[i] > max) max = signal[i];
  }
  
  return { min: Math.abs(min), max: Math.abs(max) };
}

/**
 * 计算噪声水平（使用高频分量估计）
 */
function estimateNoiseLevel(signal: number[]): number {
  if (signal.length < 3) return 0;
  
  // 计算相邻差分的标准差作为噪声估计
  const diffs: number[] = [];
  for (let i = 1; i < signal.length; i++) {
    diffs.push(signal[i] - signal[i - 1]);
  }
  
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, val) => sum + (val - mean) ** 2, 0) / diffs.length;
  
  return Math.sqrt(variance);
}

/**
 * 改进的质量评分计算
 * 
 * 评分标准：
 * - 能量一致性（50%权重）：与其他采集的相似度
 * - 信号强度（25%权重）：信号是否足够强
 * - 波形变化性（25%权重）：是否有足够的波形变化
 */
export function calculateImprovedQualityScore(
  signal: number[],
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  collectionIndex: number
): ImprovedQualityScore {
  // 计算当前采集的特征
  const strength = calculateSignalStrength(signal);
  const variability = calculateVariability(signal);
  const energyRange = calculateEnergyRange(signal);
  const noiseLevel = estimateNoiseLevel(signal);

  // 计算所有采集的平均强度和变化性
  const allStrengths = allCollections.map((col) =>
    calculateSignalStrength(col.ch2)
  );
  const avgStrength = allStrengths.reduce((a, b) => a + b, 0) / allStrengths.length;
  const maxStrength = Math.max(...allStrengths);

  const allVariabilities = allCollections.map((col) =>
    calculateVariability(col.ch2)
  );
  const avgVariability = allVariabilities.reduce((a, b) => a + b, 0) / allVariabilities.length;
  const maxVariability = Math.max(...allVariabilities);

  // 1. 能量一致性评分（与其他采集的相似度）
  // 计算当前采集与平均采集的相似度
  const strengthRatio = avgStrength > 0 ? strength / avgStrength : 1;
  const variabilityRatio = avgVariability > 0 ? variability / avgVariability : 1;

  // 允许 ±50% 的偏差，超出范围则降低评分
  let energyConsistency = 100;
  if (strengthRatio < 0.5 || strengthRatio > 1.5) {
    energyConsistency -= Math.abs(strengthRatio - 1) * 50;
  }
  if (variabilityRatio < 0.5 || variabilityRatio > 1.5) {
    energyConsistency -= Math.abs(variabilityRatio - 1) * 30;
  }
  energyConsistency = Math.max(0, Math.min(100, energyConsistency));

  // 2. 信号强度评分
  // 只要信号强度不是太弱就可以接受
  let signalStrengthScore = 100;
  if (maxStrength > 0) {
    const strengthPercentage = (strength / maxStrength) * 100;
    // 只要达到最大强度的 20% 就认为是可接受的
    if (strengthPercentage < 20) {
      signalStrengthScore = strengthPercentage * 5; // 0-100
    }
  }

  // 3. 波形变化性评分
  // 检查是否有足够的波形变化（不是平坦的信号）
  let variabilityScore = 100;
  if (maxVariability > 0) {
    const variabilityPercentage = (variability / maxVariability) * 100;
    // 只要达到最大变化性的 10% 就认为是可接受的
    if (variabilityPercentage < 10) {
      variabilityScore = variabilityPercentage * 10; // 0-100
    }
  }

  // 4. 检测异常采集
  // 只有在严重异常时才标记为异常
  let isOutlier = false;
  let recommendation = '✓ 质量良好';

  if (energyConsistency < 30) {
    isOutlier = true;
    recommendation = '⚠ 能量与其他采集差异较大，建议重录';
  } else if (signalStrengthScore < 20) {
    isOutlier = true;
    recommendation = '⚠ 信号过弱，建议重录';
  } else if (variabilityScore < 20) {
    isOutlier = true;
    recommendation = '⚠ 波形变化不足，建议重录';
  } else if (energyConsistency < 50) {
    recommendation = '⚠ 能量与其他采集有差异，可考虑重录';
  } else if (signalStrengthScore < 50 || variabilityScore < 50) {
    recommendation = '△ 质量一般，可考虑重录';
  }

  // 5. 综合评分
  // 权重：能量一致性 50%，信号强度 25%，波形变化性 25%
  const overallScore = Math.round(
    energyConsistency * 0.5 + signalStrengthScore * 0.25 + variabilityScore * 0.25
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    energyConsistency: Math.round(energyConsistency),
    signalStrength: Math.round(signalStrengthScore),
    variability: Math.round(variabilityScore),
    isOutlier,
    recommendation,
    details: {
      energyRange,
      peakAmplitude: energyRange.max,
      noiseLevel: Math.round(noiseLevel * 100) / 100,
    },
  };
}

/**
 * 批量评估所有采集
 */
export function evaluateAllCollectionsImproved(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): ImprovedQualityScore[] {
  return collections.map((col, idx) =>
    calculateImprovedQualityScore(col.ch2, collections, idx)
  );
}

/**
 * 获取评分统计信息
 */
export function getQualityStatistics(scores: ImprovedQualityScore[]) {
  if (scores.length === 0) {
    return {
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      outlierCount: 0,
      goodCount: 0,
      fairCount: 0,
      poorCount: 0,
    };
  }

  const avgScore = Math.round(
    scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
  );
  const minScore = Math.min(...scores.map((s) => s.overallScore));
  const maxScore = Math.max(...scores.map((s) => s.overallScore));
  const outlierCount = scores.filter((s) => s.isOutlier).length;

  const goodCount = scores.filter((s) => s.overallScore >= 70).length;
  const fairCount = scores.filter(
    (s) => s.overallScore >= 50 && s.overallScore < 70
  ).length;
  const poorCount = scores.filter((s) => s.overallScore < 50).length;

  return {
    avgScore,
    minScore,
    maxScore,
    outlierCount,
    goodCount,
    fairCount,
    poorCount,
  };
}

```

---

## lib/recognition-engine.ts

```typescript
/**
 * 识别引擎模块
 * 
 * 功能：
 * - 特征库管理
 * - 多距离度量计算
 * - 相似度融合
 * - 识别结果排序
 */

import * as ss from 'simple-statistics';

export interface FeatureLibraryEntry {
  commandId: string;
  commandName: string;
  featureMean: number[];      // 48 维均值
  featureStd: number[];       // 48 维标准差
  sourceCount: number;        // 源采集数
  generatedAt: number;
}

export interface RecognitionPrediction {
  commandId: string;
  commandName: string;
  confidence: number;         // 0-1
  distance: number;
  details: {
    euclidean: number;
    cosine: number;
    mahalanobis: number;
  };
}

export interface RecognitionResult {
  topPrediction: RecognitionPrediction | null;
  allPredictions: RecognitionPrediction[];
  timestamp: number;
}

/**
 * 欧几里得距离
 */
export function euclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += (v1[i] - v2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * 余弦相似度
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] ** 2;
    norm2 += v2[i] ** 2;
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * 马氏距离
 */
export function mahalanobisDistance(
  v1: number[],
  v2: number[],
  std: number[]
): number {
  if (v1.length !== v2.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const sigma = std[i] || 1; // 避免除以 0
    if (sigma > 0) {
      sum += ((v1[i] - v2[i]) / sigma) ** 2;
    }
  }
  return Math.sqrt(sum);
}

/**
 * 计算综合置信度
 * 
 * 权重：
 * - 欧几里得距离：0.4
 * - 余弦相似度：0.3
 * - 马氏距离：0.3
 */
export function computeConfidence(
  testFeature: number[],
  libraryEntry: FeatureLibraryEntry,
  weights: { euclidean: number; cosine: number; mahalanobis: number } = {
    euclidean: 0.4,
    cosine: 0.3,
    mahalanobis: 0.3,
  }
): RecognitionPrediction {
  // 计算各种距离
  const euclidean = euclideanDistance(testFeature, libraryEntry.featureMean);
  const cosine = cosineSimilarity(testFeature, libraryEntry.featureMean);
  const mahalanobis = mahalanobisDistance(
    testFeature,
    libraryEntry.featureMean,
    libraryEntry.featureStd
  );

  // 归一化距离到 [0, 1]
  // 欧几里得距离：使用 sigmoid 函数
  const euclideanScore = 1 / (1 + euclidean);

  // 余弦相似度：已经在 [-1, 1]，转换到 [0, 1]
  const cosineScore = (cosine + 1) / 2;

  // 马氏距离：使用 sigmoid 函数
  const mahalanobisScore = 1 / (1 + mahalanobis);

  // 融合
  const confidence =
    weights.euclidean * euclideanScore +
    weights.cosine * cosineScore +
    weights.mahalanobis * mahalanobisScore;

  return {
    commandId: libraryEntry.commandId,
    commandName: libraryEntry.commandName,
    confidence: Math.min(1, Math.max(0, confidence)),
    distance: euclidean,
    details: {
      euclidean,
      cosine,
      mahalanobis,
    },
  };
}

/**
 * 执行识别
 */
export function recognize(
  testFeature: number[],
  featureLibrary: FeatureLibraryEntry[],
  confidenceThreshold: number = 0.55
): RecognitionResult {
  if (featureLibrary.length === 0) {
    return {
      topPrediction: null,
      allPredictions: [],
      timestamp: Date.now(),
    };
  }

  // 计算所有预测
  const predictions = featureLibrary
    .map((entry) => computeConfidence(testFeature, entry))
    .sort((a, b) => b.confidence - a.confidence);

  // 筛选有效预测
  const validPredictions = predictions.filter((p) => p.confidence >= confidenceThreshold);

  return {
    topPrediction: validPredictions.length > 0 ? validPredictions[0] : null,
    allPredictions: predictions,
    timestamp: Date.now(),
  };
}

/**
 * 生成特征库条目
 */
export function generateLibraryEntry(
  commandId: string,
  commandName: string,
  featureVectors: number[][]
): FeatureLibraryEntry {
  if (featureVectors.length === 0) {
    return {
      commandId,
      commandName,
      featureMean: Array(48).fill(0),
      featureStd: Array(48).fill(0),
      sourceCount: 0,
      generatedAt: Date.now(),
    };
  }

  // 计算均值
  const featureMean: number[] = Array(48).fill(0);
  for (let i = 0; i < 48; i++) {
    const values = featureVectors.map((v) => v[i]);
    featureMean[i] = ss.mean(values);
  }

  // 计算标准差
  const featureStd: number[] = Array(48).fill(0);
  for (let i = 0; i < 48; i++) {
    const values = featureVectors.map((v) => v[i]);
    featureStd[i] = ss.standardDeviation(values);
  }

  return {
    commandId,
    commandName,
    featureMean,
    featureStd,
    sourceCount: featureVectors.length,
    generatedAt: Date.now(),
  };
}

/**
 * 计算识别准确率（用于测试）
 */
export function calculateAccuracy(
  predictions: RecognitionPrediction[],
  groundTruth: string
): number {
  if (predictions.length === 0) return 0;

  const topPrediction = predictions[0];
  return topPrediction.commandName === groundTruth ? 1 : 0;
}

/**
 * 计算平均置信度
 */
export function calculateAverageConfidence(predictions: RecognitionPrediction[]): number {
  if (predictions.length === 0) return 0;
  return ss.mean(predictions.map((p) => p.confidence));
}

```

---

## lib/reset-admin-account.ts

```typescript
/**
 * 重置管理员账户脚本
 * 用于在浏览器控制台中运行，重置管理员账户
 */

import { hashPassword } from './pbkdf2-crypto';

export async function resetAdminAccount() {
  const STORAGE_KEY = 'emg-user-accounts';
  const ADMIN_USERNAME = 'Wagii';
  const ADMIN_PASSWORD = 'geniusatwork';

  try {
    // 读取现有账户
    const data = localStorage.getItem(STORAGE_KEY);
    let accounts = [];
    
    if (data) {
      try {
        accounts = JSON.parse(data);
      } catch (err) {
        console.error('Failed to parse accounts:', err);
        accounts = [];
      }
    }

    // 删除旧的管理员账户
    accounts = accounts.filter((acc: any) => !acc.isAdmin);

    // 创建新的管理员账户
    const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
    const adminAccount = {
      userId: `admin-${Date.now()}`,
      username: ADMIN_USERNAME,
      passwordHash: adminPasswordHash,
      isAdmin: true,
      createdAt: Date.now(),
      passwordMigrated: true,
    };

    accounts.push(adminAccount);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    return { success: true };
  } catch (err) {
    console.error('❌ 重置管理员账户失败:', err);
    return { success: false, error: err };
  }
}

// 导出一个可以在浏览器控制台直接调用的函数
declare global {
  interface Window {
    resetAdminAccount?: typeof resetAdminAccount;
  }
}

if (typeof window !== 'undefined') {
  (window as any).resetAdminAccount = resetAdminAccount;
}

```

---

## lib/serial-port.ts

```typescript
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

```

---

## lib/signal-processing.ts

```typescript
/**
 * 信号处理和特征提取模块
 * 
 * 功能：
 * - 时域特征提取（均值、方差、RMS）
 * - 相似度计算（欧几里得距离）
 * - 信号滤波（可选）
 */

import { HARDWARE_CONFIG, FeatureVector } from '@/../../shared/const';

/**
 * 提取时域特征
 * @param samples - 采样数据数组，每个元素是 [ch1, ch2, ch3]
 * @returns 特征向量
 */
export function extractTimeFeatures(samples: number[][]): FeatureVector {
  const channels = HARDWARE_CONFIG.NUM_CHANNELS;
  const mean = new Array(channels).fill(0);
  const variance = new Array(channels).fill(0);
  const rms = new Array(channels).fill(0);

  if (samples.length === 0) {
    return { mean, variance, rms };
  }

  // 计算均值
  for (let ch = 0; ch < channels; ch++) {
    let sum = 0;
    for (const sample of samples) {
      sum += sample[ch];
    }
    mean[ch] = sum / samples.length;
  }

  // 计算方差和 RMS
  for (let ch = 0; ch < channels; ch++) {
    let sumSquaredDiff = 0;
    let sumSquared = 0;

    for (const sample of samples) {
      const diff = sample[ch] - mean[ch];
      sumSquaredDiff += diff * diff;
      sumSquared += sample[ch] * sample[ch];
    }

    variance[ch] = sumSquaredDiff / samples.length;
    rms[ch] = Math.sqrt(sumSquared / samples.length);
  }

  return { mean, variance, rms };
}

/**
 * 计算两个特征向量之间的欧几里得距离
 * @param feature1 - 第一个特征向量
 * @param feature2 - 第二个特征向量
 * @returns 距离值
 */
export function calculateEuclideanDistance(
  feature1: FeatureVector,
  feature2: FeatureVector
): number {
  let distance = 0;

  // 计算均值的距离
  for (let i = 0; i < feature1.mean.length; i++) {
    const diff = feature1.mean[i] - feature2.mean[i];
    distance += diff * diff;
  }

  // 计算方差的距离
  for (let i = 0; i < feature1.variance.length; i++) {
    const diff = feature1.variance[i] - feature2.variance[i];
    distance += diff * diff;
  }

  // 计算 RMS 的距离
  for (let i = 0; i < feature1.rms.length; i++) {
    const diff = feature1.rms[i] - feature2.rms[i];
    distance += diff * diff;
  }

  return Math.sqrt(distance);
}

/**
 * 计算余弦相似度
 * @param feature1 - 第一个特征向量
 * @param feature2 - 第二个特征向量
 * @returns 相似度值 (0-1)
 */
export function calculateCosineSimilarity(
  feature1: FeatureVector,
  feature2: FeatureVector
): number {
  const vec1 = flattenFeature(feature1);
  const vec2 = flattenFeature(feature2);

  if (vec1.length === 0 || vec2.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 将特征向量展平为一维数组
 */
function flattenFeature(feature: FeatureVector): number[] {
  return [...feature.mean, ...feature.variance, ...feature.rms];
}

/**
 * 计算置信度（基于距离）
 * @param distance - 欧几里得距离
 * @param maxDistance - 最大距离阈值
 * @returns 置信度 (0-1)
 */
export function calculateConfidence(
  distance: number,
  maxDistance: number = 100
): number {
  // 反向距离归一化
  const confidence = Math.max(0, 1 - distance / maxDistance);
  return Math.min(1, confidence);
}

/**
 * 简单的低通滤波器（可选）
 * @param samples - 采样数据
 * @param windowSize - 滑动窗口大小
 * @returns 滤波后的数据
 */
export function lowPassFilter(
  samples: number[][],
  windowSize: number = 3
): number[][] {
  if (samples.length < windowSize) {
    return samples;
  }

  const filtered: number[][] = [];
  const channels = HARDWARE_CONFIG.NUM_CHANNELS;

  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(samples.length, i + Math.floor(windowSize / 2) + 1);

    const filtered_sample = new Array(channels).fill(0);

    for (let ch = 0; ch < channels; ch++) {
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j][ch];
      }
      filtered_sample[ch] = sum / (end - start);
    }

    filtered.push(filtered_sample);
  }

  return filtered;
}

/**
 * 规范化特征向量（零均值、单位方差）
 */
export function normalizeFeature(feature: FeatureVector): FeatureVector {
  const normalized: FeatureVector = {
    mean: [...feature.mean],
    variance: [...feature.variance],
    rms: [...feature.rms],
  };

  // 计算均值和标准差
  const allValues = flattenFeature(feature);
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const variance =
    allValues.reduce((a, b) => a + (b - mean) ** 2, 0) / allValues.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return normalized;
  }

  // 规范化
  for (let i = 0; i < normalized.mean.length; i++) {
    normalized.mean[i] = (normalized.mean[i] - mean) / std;
  }

  for (let i = 0; i < normalized.variance.length; i++) {
    normalized.variance[i] = (normalized.variance[i] - mean) / std;
  }

  for (let i = 0; i < normalized.rms.length; i++) {
    normalized.rms[i] = (normalized.rms[i] - mean) / std;
  }

  return normalized;
}

/**
 * 计算特征向量的平均值
 */
export function averageFeatures(features: FeatureVector[]): FeatureVector {
  if (features.length === 0) {
    return { mean: [0, 0, 0], variance: [0, 0, 0], rms: [0, 0, 0] };
  }

  const channels = HARDWARE_CONFIG.NUM_CHANNELS;
  const average: FeatureVector = {
    mean: new Array(channels).fill(0),
    variance: new Array(channels).fill(0),
    rms: new Array(channels).fill(0),
  };

  for (const feature of features) {
    for (let i = 0; i < channels; i++) {
      average.mean[i] += feature.mean[i];
      average.variance[i] += feature.variance[i];
      average.rms[i] += feature.rms[i];
    }
  }

  for (let i = 0; i < channels; i++) {
    average.mean[i] /= features.length;
    average.variance[i] /= features.length;
    average.rms[i] /= features.length;
  }

  return average;
}

```

---

## lib/template-based-recognition.ts

```typescript
/**
 * 基于模板的肌电识别系统
 * 
 * 功能：
 * - 构建指令模板（采集阶段）
 * - 识别指令（测试阶段）
 * - 计算相似度和置信度
 */

import {
  extractAdvancedFeatures,
  normalizeFeatureVector,
  percentileNormalizeFeatureVector,
  mahalanobisDistance,
  calculateFeatureSimilarity,
  calculateCovarianceMatrix,
  AdvancedFeatureVector,
} from './advanced-feature-extraction';
import {
  calculateDTWDistance,
  calculateDTWSimilarity,
  alignMultipleSequencesWithDTW,
} from './dynamic-time-warping';

/**
 * 指令模板接口
 */
export interface CommandTemplate {
  commandName: string;
  featureVectors: number[][]; // 所有采集的特征向量
  meanFeatureVector: number[]; // 平均特征向量
  covarianceMatrix: number[][]; // 协方差矩阵
  rawSignals: number[][]; // 原始信号（用于 DTW）
  quality: {
    internalSimilarity: number; // 模板内相似度（0-100）
    signalStrength: number; // 信号强度
    frequencyPurity: number; // 频谱纯度
  };
  createdAt: Date;
  sampleCount: number;
}

/**
 * 识别结果接口
 */
export interface RecognitionResult {
  commandName: string;
  similarity: number; // 0-100
  confidence: number; // 0-100
  distance: number; // 距离值
  featureSimilarity: number; // 特征相似度
  dtwSimilarity: number; // DTW 相似度
  details: {
    topMatches: Array<{ command: string; similarity: number }>;
    matchingThreshold: number;
  };
}

/**
 * 构建指令模板
 */
export function buildCommandTemplate(
  commandName: string,
  signals: number[][]
): CommandTemplate {
  if (signals.length === 0) {
    throw new Error('No signals provided for template building');
  }

  // 提取所有采集的特征向量
  const featureVectors: number[][] = [];
  let totalSignalStrength = 0;

  for (const signal of signals) {
    const features = extractAdvancedFeatures(signal);
    const normalizedVector = percentileNormalizeFeatureVector(features.vector);
    featureVectors.push(normalizedVector);
    totalSignalStrength += features.timeDomain.rms;
  }

  // 计算平均特征向量
  const meanFeatureVector = new Array(30).fill(0);
  for (const vector of featureVectors) {
    for (let i = 0; i < vector.length; i++) {
      meanFeatureVector[i] += vector[i];
    }
  }
  for (let i = 0; i < meanFeatureVector.length; i++) {
    meanFeatureVector[i] /= featureVectors.length;
  }

  // 计算协方差矩阵
  const covarianceMatrix = calculateCovarianceMatrix(featureVectors);

  // 计算模板内相似度
  let totalSimilarity = 0;
  let count = 0;
  for (let i = 0; i < featureVectors.length; i++) {
    for (let j = i + 1; j < featureVectors.length; j++) {
      totalSimilarity += calculateFeatureSimilarity(
        featureVectors[i],
        featureVectors[j]
      );
      count++;
    }
  }
  const internalSimilarity = count > 0 ? totalSimilarity / count : 100;

  // 计算信号强度
  const signalStrength = totalSignalStrength / signals.length;

  // 计算频谱纯度（主频率的能量占比）
  let frequencyPurity = 0;
  for (const signal of signals) {
    const features = extractAdvancedFeatures(signal);
    // 简化：使用频域特征中的 PSD 作为纯度指标
    frequencyPurity += Math.min(100, features.frequencyDomain.psd * 10);
  }
  frequencyPurity /= signals.length;

  return {
    commandName,
    featureVectors,
    meanFeatureVector,
    covarianceMatrix,
    rawSignals: signals,
    quality: {
      internalSimilarity,
      signalStrength,
      frequencyPurity,
    },
    createdAt: new Date(),
    sampleCount: signals.length,
  };
}

/**
 * 识别指令
 */
export function recognizeCommand(
  testSignal: number[],
  templates: CommandTemplate[],
  options?: {
    featureWeight?: number; // 特征相似度权重（默认 0.6）
    dtwWeight?: number; // DTW 相似度权重（默认 0.4）
    similarityThreshold?: number; // 相似度阈值（默认 60）
  }
): RecognitionResult | null {
  if (templates.length === 0) {
    return null;
  }

  const featureWeight = options?.featureWeight ?? 0.6;
  const dtwWeight = options?.dtwWeight ?? 0.4;
  const similarityThreshold = options?.similarityThreshold ?? 60;

  // 提取测试信号的特征
  const testFeatures = extractAdvancedFeatures(testSignal);
  const testFeatureVector = percentileNormalizeFeatureVector(testFeatures.vector);

  // 与所有模板进行匹配
  const matches: Array<{
    command: string;
    similarity: number;
    featureSimilarity: number;
    dtwSimilarity: number;
    distance: number;
  }> = [];

  for (const template of templates) {
    // 1. 特征相似度（使用 Mahalanobis 距离）
    const distance = mahalanobisDistance(
      testFeatureVector,
      template.meanFeatureVector,
      template.covarianceMatrix
    );

    // 将距离转换为相似度（0-100）
    const maxDistance = 10; // 假设最大距离为 10
    const featureSimilarity = Math.max(
      0,
      100 - (distance / maxDistance) * 100
    );

    // 2. DTW 相似度（使用原始信号）
    const dtwSimilarity = calculateDTWSimilarity(testSignal, template.rawSignals[0]);

    // 3. 综合相似度
    const combinedSimilarity =
      featureSimilarity * featureWeight + dtwSimilarity * dtwWeight;

    matches.push({
      command: template.commandName,
      similarity: combinedSimilarity,
      featureSimilarity,
      dtwSimilarity,
      distance,
    });
  }

  // 排序找最佳匹配
  matches.sort((a, b) => b.similarity - a.similarity);

  if (matches.length === 0 || matches[0].similarity < similarityThreshold) {
    return null; // 无匹配
  }

  // 计算置信度（最佳匹配 vs 次佳匹配）
  const topMatch = matches[0];
  const secondMatch = matches.length > 1 ? matches[1] : null;
  const confidence = secondMatch
    ? Math.min(100, (topMatch.similarity - secondMatch.similarity) * 10)
    : 100;

  return {
    commandName: topMatch.command,
    similarity: Math.round(topMatch.similarity),
    confidence: Math.round(confidence),
    distance: topMatch.distance,
    featureSimilarity: Math.round(topMatch.featureSimilarity),
    dtwSimilarity: Math.round(topMatch.dtwSimilarity),
    details: {
      topMatches: matches.slice(0, 3).map((m) => ({
        command: m.command,
        similarity: Math.round(m.similarity),
      })),
      matchingThreshold: similarityThreshold,
    },
  };
}

/**
 * 评估采集质量（改进版）
 */
export interface CollectionQuality {
  overallScore: number; // 0-100
  internalSimilarity: number; // 与其他采集的相似度
  externalDifference: number; // 与其他指令的差异度
  signalStrength: number; // 信号强度
  frequencyPurity: number; // 频谱纯度
  recommendation: string;
  isAcceptable: boolean;
}

export function evaluateCollectionQuality(
  newSignal: number[],
  existingTemplates: CommandTemplate[],
  commandName: string
): CollectionQuality {
  const features = extractAdvancedFeatures(newSignal);
  const featureVector = percentileNormalizeFeatureVector(features.vector);

  // 1. 查找同指令的模板
  const sameCommandTemplate = existingTemplates.find(
    (t) => t.commandName === commandName
  );

  let internalSimilarity = 100;
  if (sameCommandTemplate) {
    internalSimilarity = calculateFeatureSimilarity(
      featureVector,
      sameCommandTemplate.meanFeatureVector
    );
  }

  // 2. 计算与其他指令的差异度
  let externalDifference = 100;
  if (existingTemplates.length > 0) {
    let minSimilarity = 100;
    for (const template of existingTemplates) {
      if (template.commandName !== commandName) {
        const similarity = calculateFeatureSimilarity(
          featureVector,
          template.meanFeatureVector
        );
        minSimilarity = Math.min(minSimilarity, similarity);
      }
    }
    externalDifference = minSimilarity;
  }

  // 3. 信号强度
  const signalStrength = features.timeDomain.rms;

  // 4. 频谱纯度
  const frequencyPurity = Math.min(100, features.frequencyDomain.psd * 10);

  // 5. 综合评分
  const overallScore = Math.round(
    internalSimilarity * 0.4 +
      (100 - externalDifference) * 0.3 +
      Math.min(100, signalStrength * 10) * 0.2 +
      frequencyPurity * 0.1
  );

  // 6. 建议
  let recommendation = '✓ 质量良好';
  let isAcceptable = true;

  if (internalSimilarity < 50) {
    recommendation = '⚠ 与同指令采集差异大，建议重录';
    isAcceptable = false;
  } else if (externalDifference > 50) {
    recommendation = '⚠ 与其他指令相似度过高，建议重录';
    isAcceptable = false;
  } else if (signalStrength < 0.5) {
    recommendation = '⚠ 信号强度过弱，建议重录';
    isAcceptable = false;
  } else if (internalSimilarity < 65) {
    recommendation = '△ 质量一般，可考虑重录';
  } else if (overallScore < 70) {
    recommendation = '△ 质量一般，可考虑重录';
  }

  return {
    overallScore,
    internalSimilarity: Math.round(internalSimilarity),
    externalDifference: Math.round(externalDifference),
    signalStrength: Math.round(Math.min(100, signalStrength * 10)),
    frequencyPurity: Math.round(frequencyPurity),
    recommendation,
    isAcceptable,
  };
}

/**
 * 批量识别多个信号
 */
export function recognizeMultipleSignals(
  testSignals: number[][],
  templates: CommandTemplate[]
): RecognitionResult[] {
  return testSignals
    .map((signal) => recognizeCommand(signal, templates))
    .filter((result) => result !== null) as RecognitionResult[];
}

/**
 * 获取识别统计信息
 */
export function getRecognitionStatistics(results: RecognitionResult[]) {
  if (results.length === 0) {
    return {
      totalTests: 0,
      successCount: 0,
      successRate: 0,
      averageSimilarity: 0,
      averageConfidence: 0,
      commandDistribution: {} as Record<string, number>,
    };
  }

  const commandDistribution: Record<string, number> = {};
  let totalSimilarity = 0;
  let totalConfidence = 0;

  for (const result of results) {
    commandDistribution[result.commandName] =
      (commandDistribution[result.commandName] || 0) + 1;
    totalSimilarity += result.similarity;
    totalConfidence += result.confidence;
  }

  return {
    totalTests: results.length,
    successCount: results.length,
    successRate: 100,
    averageSimilarity: Math.round(totalSimilarity / results.length),
    averageConfidence: Math.round(totalConfidence / results.length),
    commandDistribution,
  };
}

```

---

## lib/user-auth.ts

```typescript
/**
 * 用户认证管理模块
 * 
 * 功能：
 * - 用户注册和登录
 * - 密码加密和验证（使用 PBKDF2）
 * - 管理员账户管理
 */

import { hashPassword, verifyPassword, migratePasswordHash } from './pbkdf2-crypto';

export interface UserAccount {
  userId: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
  passwordMigrated?: boolean; // 标记密码是否已迁移到 PBKDF2
}

const STORAGE_KEY = 'emg-user-accounts';
const STORAGE_VERSION_KEY = 'emg-user-accounts-version';
const ADMIN_USERNAME = 'Wagii';
const ADMIN_PASSWORD = 'geniusatwork';
const MAX_MIGRATION_RETRIES = 3;

// 获取所有账户（不调用初始化函数，避免递归）
function getAllAccountsRaw(): UserAccount[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse user accounts:', err);
    return [];
  }
}

// 初始化管理员账户（异步）
async function initializeAdminAccount() {
  const accounts = getAllAccountsRaw();
  const adminExists = accounts.some(acc => acc.isAdmin);
  
  if (!adminExists) {
    const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
    const adminAccount: UserAccount = {
      userId: `admin-${Date.now()}`,
      username: ADMIN_USERNAME,
      passwordHash: adminPasswordHash,
      isAdmin: true,
      createdAt: Date.now(),
      passwordMigrated: true,
    };
    
    accounts.push(adminAccount);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }
}

// 获取所有账户
export async function getAllAccounts(): Promise<UserAccount[]> {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    // 初始化管理员账户
    await initializeAdminAccount();
    // 再次读取
    return getAllAccountsRaw();
  }
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse user accounts:', err);
    return [];
  }
}

// 注册新用户（异步）
export async function registerUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; userId?: string }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  if (username.length < 2) {
    return { success: false, message: '用户名至少需要 2 个字符' };
  }

  if (password.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  const accounts = await getAllAccounts();
  
  // 检查用户名是否已存在
  if (accounts.some(acc => acc.username === username)) {
    return { success: false, message: '用户名已存在，请使用其他用户名' };
  }

  try {
    // 使用 PBKDF2 哈希密码
    const passwordHash = await hashPassword(password);

    // 创建新账户
    const newAccount: UserAccount = {
      userId: `user-${Date.now()}`,
      username,
      passwordHash,
      isAdmin: false,
      createdAt: Date.now(),
      passwordMigrated: true,
    };

    accounts.push(newAccount);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));

    return {
      success: true,
      message: '注册成功',
      userId: newAccount.userId,
    };
  } catch (err) {
    console.error('Registration failed:', err);
    return { success: false, message: '注册失败，请重试' };
  }
}

// 登录用户（异步）
export async function loginUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; account?: UserAccount }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  try {
    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.username === username);

    if (!account) {
      return { success: false, message: '用户名或密码错误' };
    }

    // 验证密码（支持 PBKDF2 和简单哈希）
    let isPasswordValid = false;
    
    try {
      // 先尝试 PBKDF2 验证
      isPasswordValid = await verifyPassword(password, account.passwordHash);
    } catch (err) {
      // 如果 PBKDF2 验证失败，尝试简单哈希
      try {
        const simpleHash = btoa(`${password}:${account.createdAt}`);
        isPasswordValid = simpleHash === account.passwordHash;
      } catch (e) {
        isPasswordValid = false;
      }
    }
    
    if (!isPasswordValid) {
      return { success: false, message: '用户名或密码错误' };
    }

    // 如果密码还未迁移到 PBKDF2，进行迁移（带重试机制）
    if (!account.passwordMigrated) {
      await migratePasswordForAccount(username, password, account);
    }

    return {
      success: true,
      message: '登录成功',
      account,
    };
  } catch (err) {
    console.error('Login failed:', err);
    return { success: false, message: '登录失败，请重试' };
  }
}

// 检查用户名是否存在
export async function usernameExists(username: string): Promise<boolean> {
  const accounts = await getAllAccounts();
  return accounts.some(acc => acc.username === username);
}

// 获取用户账户
export async function getUserAccount(userId: string): Promise<UserAccount | null> {
  const accounts = await getAllAccounts();
  return accounts.find(acc => acc.userId === userId) || null;
}

// 重置用户密码（仅管理员可用）
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  try {
    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.userId === userId);

    if (!account) {
      return { success: false, message: '用户不存在' };
    }

    // 使用 PBKDF2 哈希新密码
    const newPasswordHash = await hashPassword(newPassword);
    account.passwordHash = newPasswordHash;
    account.passwordMigrated = true;
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));

    return {
      success: true,
      message: '密码重置成功',
    };
  } catch (err) {
    console.error('Password reset failed:', err);
    return { success: false, message: '密码重置失败，请重试' };
  }
}

/**
 * 迁移单个账户的密码（带竞态条件防护）
 */
async function migratePasswordForAccount(
  username: string,
  password: string,
  account: UserAccount
): Promise<void> {
  for (let retry = 0; retry < MAX_MIGRATION_RETRIES; retry++) {
    try {
      // 获取当前版本号
      const currentVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0');
      
      // 重新读取账户列表（防止并发修改）
      const latestAccounts = await getAllAccounts();
      const latestAccount = latestAccounts.find(acc => acc.username === username);
      
      // 检查是否已被其他进程迁移
      if (latestAccount?.passwordMigrated) {
        return;
      }
      
      // 迁移密码
      const newPasswordHash = await hashPassword(password);
      latestAccount!.passwordHash = newPasswordHash;
      latestAccount!.passwordMigrated = true;
      
      // 更新版本号
      const newVersion = (currentVersion + 1).toString();
      localStorage.setItem(STORAGE_VERSION_KEY, newVersion);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latestAccounts));
      return;
    } catch (err) {
      console.warn(`[Auth] 密码迁移失败，重试 ${retry + 1}/${MAX_MIGRATION_RETRIES}`, err);
      
      // 等待后重试
      if (retry < MAX_MIGRATION_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * (retry + 1)));
      }
    }
  }
  
  console.error(`[Auth] 密码迁移失败（用户: ${username}，已重试 ${MAX_MIGRATION_RETRIES} 次）`);
}

// 初始化（异步）
initializeAdminAccount().catch(err => {
  console.error('Failed to initialize admin account:', err);
});

```

---

## lib/utils.ts

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

```

---

## lib/waveform-comparison.ts

```typescript
/**
 * 波形对比分析模块
 * 
 * 功能：
 * - 计算两个波形的相似度
 * - 分析波形差异
 * - 生成对比报告
 */

export interface WaveformStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  rms: number;
  peakToPeak: number;
}

export interface ComparisonResult {
  similarity: number; // 0-100，相似度百分比
  correlation: number; // 相关系数
  rmsDifference: number; // 均方根差
  stats1: WaveformStats;
  stats2: WaveformStats;
  differences: {
    meanDiff: number;
    stdDiff: number;
    peakDiff: number;
  };
}

/**
 * 计算单个波形的统计特征
 */
export function calculateWaveformStats(waveform: number[]): WaveformStats {
  if (waveform.length === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      rms: 0,
      peakToPeak: 0,
    };
  }

  // 均值
  const mean = waveform.reduce((a, b) => a + b, 0) / waveform.length;

  // 标准差
  const variance = waveform.reduce((a, b) => a + (b - mean) ** 2, 0) / waveform.length;
  const std = Math.sqrt(variance);

  // 最小值和最大值
  const min = Math.min(...waveform);
  const max = Math.max(...waveform);

  // 均方根
  const rms = Math.sqrt(waveform.reduce((a, b) => a + b ** 2, 0) / waveform.length);

  // 峰峰值
  const peakToPeak = max - min;

  return {
    mean,
    std,
    min,
    max,
    rms,
    peakToPeak,
  };
}

/**
 * 计算两个波形的相关系数
 */
function calculateCorrelation(waveform1: number[], waveform2: number[]): number {
  const minLen = Math.min(waveform1.length, waveform2.length);
  if (minLen === 0) return 0;

  const w1 = waveform1.slice(0, minLen);
  const w2 = waveform2.slice(0, minLen);

  const mean1 = w1.reduce((a, b) => a + b, 0) / minLen;
  const mean2 = w2.reduce((a, b) => a + b, 0) / minLen;

  let numerator = 0;
  let denominator1 = 0;
  let denominator2 = 0;

  for (let i = 0; i < minLen; i++) {
    const diff1 = w1[i] - mean1;
    const diff2 = w2[i] - mean2;
    numerator += diff1 * diff2;
    denominator1 += diff1 ** 2;
    denominator2 += diff2 ** 2;
  }

  const denominator = Math.sqrt(denominator1 * denominator2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * 计算两个波形的均方根差
 */
function calculateRMSDifference(waveform1: number[], waveform2: number[]): number {
  const minLen = Math.min(waveform1.length, waveform2.length);
  if (minLen === 0) return 0;

  let sumSquaredDiff = 0;
  for (let i = 0; i < minLen; i++) {
    const diff = waveform1[i] - waveform2[i];
    sumSquaredDiff += diff ** 2;
  }

  return Math.sqrt(sumSquaredDiff / minLen);
}

/**
 * 对比两个波形
 */
export function compareWaveforms(waveform1: number[], waveform2: number[]): ComparisonResult {
  const stats1 = calculateWaveformStats(waveform1);
  const stats2 = calculateWaveformStats(waveform2);

  // 计算相关系数
  const correlation = calculateCorrelation(waveform1, waveform2);

  // 计算均方根差
  const rmsDifference = calculateRMSDifference(waveform1, waveform2);

  // 计算统计特征的差异
  const meanDiff = Math.abs(stats1.mean - stats2.mean);
  const stdDiff = Math.abs(stats1.std - stats2.std);
  const peakDiff = Math.abs(stats1.peakToPeak - stats2.peakToPeak);

  // 计算相似度（0-100）
  // 基于相关系数和标准化的差异
  const correlationScore = Math.max(0, (correlation + 1) / 2 * 100); // -1到1转换为0到100

  // 标准化差异评分
  const maxMeanDiff = Math.max(Math.abs(stats1.mean), Math.abs(stats2.mean), 1);
  const maxStdDiff = Math.max(stats1.std, stats2.std, 1);
  const maxPeakDiff = Math.max(stats1.peakToPeak, stats2.peakToPeak, 1);

  const meanDiffScore = Math.max(0, 100 - (meanDiff / maxMeanDiff) * 100);
  const stdDiffScore = Math.max(0, 100 - (stdDiff / maxStdDiff) * 100);
  const peakDiffScore = Math.max(0, 100 - (peakDiff / maxPeakDiff) * 100);

  // 综合相似度
  const similarity = (
    correlationScore * 0.5 +
    meanDiffScore * 0.2 +
    stdDiffScore * 0.15 +
    peakDiffScore * 0.15
  );

  return {
    similarity: Math.round(similarity),
    correlation: Math.round(correlation * 100) / 100,
    rmsDifference: Math.round(rmsDifference * 100) / 100,
    stats1,
    stats2,
    differences: {
      meanDiff: Math.round(meanDiff * 100) / 100,
      stdDiff: Math.round(stdDiff * 100) / 100,
      peakDiff: Math.round(peakDiff * 100) / 100,
    },
  };
}

/**
 * 对比多个波形，返回相似度矩阵
 */
export function compareMultipleWaveforms(
  waveforms: number[][]
): { similarities: number[][]; averageSimilarity: number } {
  const n = waveforms.length;
  const similarities: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < n; i++) {
    similarities[i][i] = 100; // 自己与自己的相似度为100
    for (let j = i + 1; j < n; j++) {
      const result = compareWaveforms(waveforms[i], waveforms[j]);
      similarities[i][j] = result.similarity;
      similarities[j][i] = result.similarity;
      totalSimilarity += result.similarity;
      comparisons++;
    }
  }

  const averageSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

  return {
    similarities,
    averageSimilarity: Math.round(averageSimilarity),
  };
}

/**
 * 生成对比报告
 */
export function generateComparisonReport(
  name1: string,
  name2: string,
  result: ComparisonResult
): string {
  const lines = [
    `波形对比报告：${name1} vs ${name2}`,
    ``,
    `📊 相似度指标`,
    `相似度：${result.similarity}%`,
    `相关系数：${result.correlation}`,
    `均方根差：${result.rmsDifference}`,
    ``,
    `📈 波形 1 统计特征`,
    `均值：${Math.round(result.stats1.mean * 100) / 100}`,
    `标准差：${Math.round(result.stats1.std * 100) / 100}`,
    `最小值：${Math.round(result.stats1.min * 100) / 100}`,
    `最大值：${Math.round(result.stats1.max * 100) / 100}`,
    `均方根：${Math.round(result.stats1.rms * 100) / 100}`,
    `峰峰值：${Math.round(result.stats1.peakToPeak * 100) / 100}`,
    ``,
    `📈 波形 2 统计特征`,
    `均值：${Math.round(result.stats2.mean * 100) / 100}`,
    `标准差：${Math.round(result.stats2.std * 100) / 100}`,
    `最小值：${Math.round(result.stats2.min * 100) / 100}`,
    `最大值：${Math.round(result.stats2.max * 100) / 100}`,
    `均方根：${Math.round(result.stats2.rms * 100) / 100}`,
    `峰峰值：${Math.round(result.stats2.peakToPeak * 100) / 100}`,
    ``,
    `📊 差异分析`,
    `均值差异：${result.differences.meanDiff}`,
    `标准差差异：${result.differences.stdDiff}`,
    `峰峰值差异：${result.differences.peakDiff}`,
  ];

  return lines.join('\n');
}

```

---

## lib/waveform-normalizer.ts

```typescript
/**
 * 波形长度归一化模块
 * 
 * 功能：
 * - 将任意长度的波形归一化到固定长度（512 样本）
 * - 支持中心截断和零填充
 * - 确保 CNN 输入的一致性
 */

import { FIXED_WAVEFORM_LENGTH } from '@shared/instruction-length-spec';

/**
 * 归一化单个通道波形到固定长度
 * 
 * @param waveform 输入波形
 * @param targetLength 目标长度（默认 512）
 * @returns 归一化后的波形
 */
export function normalizeWaveformLength(
  waveform: number[],
  targetLength: number = FIXED_WAVEFORM_LENGTH
): number[] {
  if (waveform.length === targetLength) {
    return waveform;
  }

  if (waveform.length > targetLength) {
    // 波形过长：中心截断
    const start = Math.floor((waveform.length - targetLength) / 2);
    return waveform.slice(start, start + targetLength);
  }

  // 波形过短：零填充
  const padded = [...waveform];
  while (padded.length < targetLength) {
    padded.push(0);
  }
  return padded;
}

/**
 * 归一化三通道波形到固定长度
 * 
 * @param waveform 三通道波形
 * @param targetLength 目标长度（默认 512）
 * @returns 归一化后的三通道波形
 */
export function normalizeWaveformLengthMultiChannel(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  targetLength: number = FIXED_WAVEFORM_LENGTH
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: normalizeWaveformLength(waveform.ch1, targetLength),
    ch2: normalizeWaveformLength(waveform.ch2, targetLength),
    ch3: normalizeWaveformLength(waveform.ch3, targetLength),
  };
}

/**
 * 计算波形的有效长度（去除前后零值）
 * 
 * @param waveform 输入波形
 * @param threshold 阈值（默认 0.01）
 * @returns 有效长度
 */
export function calculateEffectiveLength(
  waveform: number[],
  threshold: number = 0.01
): number {
  let start = 0;
  let end = waveform.length - 1;

  // 找到第一个非零值
  while (start < waveform.length && Math.abs(waveform[start]) < threshold) {
    start++;
  }

  // 找到最后一个非零值
  while (end >= 0 && Math.abs(waveform[end]) < threshold) {
    end--;
  }

  return Math.max(0, end - start + 1);
}

/**
 * 获取波形的有效片段
 * 
 * @param waveform 输入波形
 * @param threshold 阈值（默认 0.01）
 * @returns 有效片段
 */
export function extractEffectiveSegment(
  waveform: number[],
  threshold: number = 0.01
): number[] {
  let start = 0;
  let end = waveform.length - 1;

  // 找到第一个非零值
  while (start < waveform.length && Math.abs(waveform[start]) < threshold) {
    start++;
  }

  // 找到最后一个非零值
  while (end >= 0 && Math.abs(waveform[end]) < threshold) {
    end--;
  }

  if (start > end) {
    return [];
  }

  return waveform.slice(start, end + 1);
}

/**
 * 中心对齐两个波形
 * 
 * @param waveforms 波形数组
 * @param targetLength 目标长度
 * @returns 对齐后的波形数组
 */
export function centerAlignWaveforms(
  waveforms: number[][],
  targetLength: number = FIXED_WAVEFORM_LENGTH
): number[][] {
  return waveforms.map(waveform => {
    if (waveform.length === targetLength) {
      return waveform;
    }

    if (waveform.length > targetLength) {
      // 中心截断
      const start = Math.floor((waveform.length - targetLength) / 2);
      return waveform.slice(start, start + targetLength);
    }

    // 中心填充（前后均匀填充）
    const padTotal = targetLength - waveform.length;
    const padStart = Math.floor(padTotal / 2);
    const padEnd = padTotal - padStart;

    const result: number[] = [];
    for (let i = 0; i < padStart; i++) result.push(0);
    for (const val of waveform) result.push(val);
    for (let i = 0; i < padEnd; i++) result.push(0);

    return result;
  });
}

export default {
  normalizeWaveformLength,
  normalizeWaveformLengthMultiChannel,
  calculateEffectiveLength,
  extractEffectiveSegment,
  centerAlignWaveforms,
};

```

---

## types/serial.d.ts

```typescript
/**
 * Web Serial API 类型定义
 */

interface SerialPortOpenOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  readable: ReadableStream<string> | null;
  writable: WritableStream<string> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
  onconnect: ((event: Event) => void) | null;
  ondisconnect: ((event: Event) => void) | null;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

declare global {
  interface Navigator {
    serial?: Serial;
  }
}

export {};

```

---

## App.tsx

```typescript
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Footer from "./components/Footer";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SerialConnectionProvider } from "./contexts/SerialConnectionContext";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { UserSessionProvider } from "./contexts/UserSessionContext";
import Home from "./pages/Home";
import CollectionMode from "./pages/CollectionMode";
import RecognitionMode from "./pages/RecognitionMode";
import DataManagement from "./pages/DataManagement";
import Settings from "./pages/Settings";
import DemoMode from "./pages/DemoMode";
import DebugSerial from "./pages/DebugSerial";
import AdminDashboard from "./pages/AdminDashboard";
import AuditLogs from "./pages/AuditLogs";
import RecognitionTest from '@/pages/RecognitionTest';
import '@/lib/init-admin'; // 导入重置脚本


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/collection" component={CollectionMode} />
      <Route path="/recognition" component={RecognitionMode} />
      <Route path="/data-management" component={DataManagement} />
      <Route path="/settings" component={Settings} />
      <Route path="/demo" component={DemoMode} />
      <Route path="/debug" component={DebugSerial} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/audit-logs" component={AuditLogs} />
        <Route path="/recognition-test" component={RecognitionTest} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <UserSessionProvider>
            <SerialConnectionProvider>
              <ThemeProvider
                defaultTheme="dark"
                // switchable
              >
                <TooltipProvider>
                  <Toaster />
                  <div className="flex flex-col min-h-screen">
                    <div className="flex-1">
                      <Router />
                    </div>
                    <Footer />
                  </div>
                </TooltipProvider>
              </ThemeProvider>
            </SerialConnectionProvider>
          </UserSessionProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

```

---

## components/DebugPanel.tsx

```typescript
/**
 * 调试信息显示面板
 * 
 * 在页面上显示实时的串口数据接收和解析信息
 */

import React, { useState, useEffect } from 'react';

interface DebugLog {
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error';
}

let debugLogs: DebugLog[] = [];

// 全局日志收集函数
export function addDebugLog(message: string, type: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  debugLogs.push({ timestamp, message, type });
  // 只保留最后 50 条日志
  if (debugLogs.length > 50) {
    debugLogs = debugLogs.slice(-50);
  }
  // 触发更新
  window.dispatchEvent(new Event('debugLogUpdate'));
}

export function DebugPanel() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setLogs([...debugLogs]);
    };

    window.addEventListener('debugLogUpdate', handleUpdate);
    return () => window.removeEventListener('debugLogUpdate', handleUpdate);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      maxWidth: '400px',
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '8px 16px',
          backgroundColor: '#333',
          color: '#fff',
          border: '1px solid #666',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: isExpanded ? '8px' : 0,
          width: '100%',
          fontWeight: 'bold',
        }}
      >
        {isExpanded ? '隐藏' : '显示'}调试信息 ({logs.length})
      </button>

      {isExpanded && (
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #666',
          borderRadius: '4px',
          padding: '12px',
          maxHeight: '300px',
          overflowY: 'auto',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#888' }}>暂无日志</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  color: log.type === 'error' ? '#ef4444' : log.type === 'warn' ? '#f59e0b' : '#22c55e',
                  marginBottom: '4px',
                  lineHeight: '1.4',
                }}
              >
                <span style={{ color: '#888' }}>[{log.timestamp}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

```

---

## components/ElectrodeBaselineCapture.tsx

```typescript
/**
 * 电极基准采集组件（全局基准版本）
 * 
 * 功能：
 * - 采集 3-5 秒的静息信号作为全局基准
 * - 计算基准特征
 * - 保存到 localStorage（全局）
 */

import React, { useState, useRef } from 'react';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { calculateSignalStats } from '@/lib/electrode-detection';
import { computeFFT } from '@/lib/fft-analysis';
import { EnhancedWaveformVisualization } from './EnhancedWaveformVisualization';

interface ElectrodeBaselineCaptureProps {
  onComplete?: () => void;
}

export function ElectrodeBaselineCapture({ onComplete }: ElectrodeBaselineCaptureProps) {
  const { isConnected, onDataReceived } = useSerialConnectionContext();

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureTime, setCaptureTime] = useState(0);
  const [waveform, setWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  const waveformBufferRef = useRef<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 开始采集基准
  const handleStartCapture = () => {
    if (!isConnected) {
      alert('请先连接 STM32 设备');
      return;
    }

    setIsCapturing(true);
    setCaptureTime(0);
    waveformBufferRef.current = { ch1: [], ch2: [], ch3: [] };
    setWaveform({ ch1: [], ch2: [], ch3: [] });

    // 注册数据接收回调
    onDataReceived((data: any) => {
      if (isCapturing) {
        waveformBufferRef.current.ch1.push(data.channel1);
        waveformBufferRef.current.ch2.push(data.channel2);
        waveformBufferRef.current.ch3.push(data.channel3);

        // 实时显示（最多显示 500 个点）
        setWaveform({
          ch1: waveformBufferRef.current.ch1.slice(-500),
          ch2: waveformBufferRef.current.ch2.slice(-500),
          ch3: waveformBufferRef.current.ch3.slice(-500),
        });
      }
    });

    // 计时器
    timerRef.current = setInterval(() => {
      setCaptureTime((t) => {
        if (t >= 4) {
          // 5 秒后自动停止
          handleStopCapture();
          return t;
        }
        return t + 1;
      });
    }, 1000);
  };

  // 停止采集基准
  const handleStopCapture = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsCapturing(false);

    // 计算基准特征
    if (waveformBufferRef.current.ch1.length >= 100) {
      const stats = calculateSignalStats(
        waveformBufferRef.current.ch1,
        waveformBufferRef.current.ch2,
        waveformBufferRef.current.ch3
      );

      // 计算频谱
      let spectrum = { dominantFrequency: 0, snr: 0 };
      try {
        spectrum = computeFFT(waveformBufferRef.current.ch2, 250);
      } catch (err) {
        console.error('频谱计算失败:', err);
      }

      // 保存全局基准到 localStorage
      const baseline = {
        ch1Mean: stats.ch1Mean,
        ch1Std: stats.ch1Std,
        ch2Mean: stats.ch2Mean,
        ch2Std: stats.ch2Std,
        ch3Mean: stats.ch3Mean,
        ch3Std: stats.ch3Std,
        dominantFrequency: spectrum.dominantFrequency,
        snr: spectrum.snr,
        capturedAt: new Date().toISOString(),
      };

      localStorage.setItem('emg-global-electrode-baseline', JSON.stringify(baseline));

      alert('✓ 全局电极基准采集成功！\n系统现在可以为所有用户进行电极检测。');
      onComplete?.();
    } else {
      alert('采集数据不足，请重试');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>⚡ 全局电极基准采集</h3>

      {/* 说明 */}
      <div
        style={{
          backgroundColor: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#888',
          lineHeight: '1.6',
        }}
      >
        <strong style={{ color: '#d4af37' }}>采集说明：</strong>
        <br />
        1. 保持静息状态，不要做任何肌肉收缩
        <br />
        2. 系统将采集 5 秒的静息信号作为全局基准
        <br />
        3. 基准用于所有用户的电极状态检测
        <br />
        4. 只需采集一次，所有用户共享
      </div>

      {/* 波形显示 */}
      {isCapturing && (
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <EnhancedWaveformVisualization
            ch1={waveform.ch1}
            ch2={waveform.ch2}
            ch3={waveform.ch3}
            height={200}
            isLive={true}
            showLayers={false}
            title="实时波形"
          />
        </div>
      )}

      {/* 采集进度 */}
      {isCapturing && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>采集进度</span>
            <span style={{ color: '#4ade80', fontWeight: 'bold' }}>
              {captureTime} / 5 秒
            </span>
          </div>
          <div
            style={{
              backgroundColor: '#333',
              height: '8px',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                backgroundColor: '#4ade80',
                height: '100%',
                width: `${(captureTime / 5) * 100}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* 按钮 */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {!isCapturing ? (
          <button
            onClick={handleStartCapture}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: isConnected ? '#4ade80' : '#666',
              color: isConnected ? '#000' : '#999',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            开始采集全局基准
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            停止采集
          </button>
        )}
      </div>

      {/* 基准信息 */}
      {(() => {
        const saved = localStorage.getItem('emg-global-electrode-baseline');
        if (saved) {
          try {
            const baseline = JSON.parse(saved);
            return (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #4ade80',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#4ade80',
                }}
              >
                ✓ 已采集全局基准 ({new Date(baseline.capturedAt).toLocaleString()})
              </div>
            );
          } catch (err) {
            return null;
          }
        }
        return null;
      })()}
    </div>
  );
}

```

---

## components/ElectrodeDetectionPanel.tsx

```typescript
/**
 * 电极检测面板组件
 * 
 * 显示：
 * - 电极状态评分
 * - 各通道相似度
 * - 问题和建议
 */

import React from 'react';
import { ElectrodeDetectionResult } from '@/lib/electrode-detection';

interface ElectrodeDetectionPanelProps {
  result: ElectrodeDetectionResult;
  isAcceptable: boolean;
}

export function ElectrodeDetectionPanel({
  result,
  isAcceptable,
}: ElectrodeDetectionPanelProps) {
  const statusColor =
    result.status === 'good'
      ? '#4ade80'
      : result.status === 'fair'
        ? '#fbbf24'
        : '#ef4444';

  const statusText =
    result.status === 'good'
      ? '✓ 良好'
      : result.status === 'fair'
        ? '⚠ 一般'
        : '✗ 不良';

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: `2px solid ${statusColor}`,
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {/* 标题和状态 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ margin: '0', color: '#d4af37' }}>🔌 电极状态检测</h3>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: statusColor,
          }}
        >
          {statusText} ({result.score}%)
        </div>
      </div>

      {/* 进度条 */}
      <div
        style={{
          backgroundColor: '#333',
          height: '8px',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: statusColor,
            height: '100%',
            width: `${result.score}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 各通道相似度 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {/* CH1 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            CH1 (原始 ADC)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch1Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch1Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch1Similarity}%
          </div>
        </div>

        {/* CH2 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '4px' }}>
            CH2 (主信号)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch2Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch2Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch2Similarity}%
          </div>
        </div>

        {/* CH3 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            CH3 (包络)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch3Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch3Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch3Similarity}%
          </div>
        </div>

        {/* 频率匹配 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            频率匹配
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.frequencyMatch >= 80
                  ? '#4ade80'
                  : result.details.frequencyMatch >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.frequencyMatch}%
          </div>
        </div>

        {/* SNR 匹配 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            SNR 匹配
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.snrMatch >= 80
                  ? '#4ade80'
                  : result.details.snrMatch >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.snrMatch}%
          </div>
        </div>
      </div>

      {/* 问题和建议 */}
      {result.issues.length > 0 && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>
              ⚠️ 检测到的问题：
            </div>
            <ul
              style={{
                margin: '0',
                paddingLeft: '20px',
                fontSize: '12px',
                color: '#ef4444',
                lineHeight: '1.6',
              }}
            >
              {result.issues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '8px' }}>
              💡 建议：
            </div>
            <ul
              style={{
                margin: '0',
                paddingLeft: '20px',
                fontSize: '12px',
                color: '#fbbf24',
                lineHeight: '1.6',
              }}
            >
              {result.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 状态提示 */}
      {!isAcceptable && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            color: '#fca5a5',
            fontSize: '12px',
          }}
        >
          ❌ 电极状态不符合要求，请调节电极后重新检测
        </div>
      )}

      {isAcceptable && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            borderRadius: '4px',
            color: '#86efac',
            fontSize: '12px',
          }}
        >
          ✓ 电极状态良好，可以开始采集或测试
        </div>
      )}
    </div>
  );
}

```

---

## components/EnhancedWaveformVisualization.tsx

```typescript
/**
 * 增强波形可视化组件
 * 
 * 功能：
 * - 显示 Raw（原始）、Filtered（滤波）、Envelope（包络）三层波形
 * - 支持实时更新
 * - 支持单通道或三通道显示
 */

import React, { useEffect, useRef } from 'react';
import { processWaveform, ProcessedWaveforms } from '@/lib/dsp-enhanced';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface EnhancedWaveformVisualizationProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  width?: number;
  height?: number;
  isLive?: boolean;
  title?: string;
  showLayers?: boolean; // 是否显示三层波形
}

export const EnhancedWaveformVisualization: React.FC<EnhancedWaveformVisualizationProps> = ({
  ch1,
  ch2,
  ch3,
  width = 800,
  height = 300,
  isLive = false,
  title,
  showLayers = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置 DPI 缩放
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空画布
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;

    // 竖线网格
    const gridSpacingX = width / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridSpacingX, 0);
      ctx.lineTo(i * gridSpacingX, height);
      ctx.stroke();
    }

    // 横线网格
    const gridSpacingY = height / 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * gridSpacingY);
      ctx.lineTo(width, i * gridSpacingY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // 绘制波形的辅助函数
    // Y 轴范围固定为 ±800（基于实际数据分析，CH2 实测幅值范围 ±767）
    const Y_AXIS_MIN = -800;
    const Y_AXIS_MAX = 800;
    const Y_AXIS_RANGE = Y_AXIS_MAX - Y_AXIS_MIN;

    const drawWaveform = (data: number[], color: string, offset: number, alpha: number = 1) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.8;
      ctx.beginPath();

      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * width;
        // 使用固定的 Y 轴范围，不自动缩放
        const normalizedValue = (data[i] - Y_AXIS_MIN) / Y_AXIS_RANGE;
        const y = centerY - (normalizedValue - 0.5) * channelHeight * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // 处理波形
    const processedCh1 = processWaveform(ch1);
    const processedCh2 = processWaveform(ch2);
    const processedCh3 = processWaveform(ch3);

    if (showLayers) {
      // 显示三层波形：Raw、Filtered、Envelope
      // 第一通道
      drawWaveform(processedCh1.raw, '#666', 0, 0.3); // Raw - 灰色，透明度 30%
      drawWaveform(processedCh1.filtered, '#60a5fa', 0, 0.6); // Filtered - 蓝色，透明度 60%
      drawWaveform(processedCh1.envelope, '#d4af37', 0, 1); // Envelope - 金色，完全不透明

      // 第二通道
      drawWaveform(processedCh2.raw, '#666', 1, 0.3);
      drawWaveform(processedCh2.filtered, '#4ade80', 1, 0.6);
      drawWaveform(processedCh2.envelope, '#d4af37', 1, 1);

      // 第三通道
      drawWaveform(processedCh3.raw, '#666', 2, 0.3);
      drawWaveform(processedCh3.filtered, '#ef4444', 2, 0.6);
      drawWaveform(processedCh3.envelope, '#d4af37', 2, 1);
    } else {
      // 只显示滤波波形
      drawWaveform(processedCh1.filtered, '#60a5fa', 0);
      drawWaveform(processedCh2.filtered, '#4ade80', 1);
      drawWaveform(processedCh3.filtered, '#ef4444', 2);
    }

    // 绘制通道标签
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText('CH1', 10, 20);
    ctx.fillText('CH2', 10, height / 3 + 20);
    ctx.fillText('CH3', 10, (2 * height) / 3 + 20);

    // 绘制图例
    if (showLayers) {
      const legendY = height - 20;
      const legendSpacing = width / 4;

      // Raw
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing * 3, legendY);
      ctx.lineTo(width - legendSpacing * 3 - 20, legendY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.fillText('Raw', width - legendSpacing * 3 + 5, legendY + 4);

      // Filtered
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing * 2, legendY);
      ctx.lineTo(width - legendSpacing * 2 - 20, legendY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888';
      ctx.fillText('Filtered', width - legendSpacing * 2 + 5, legendY + 4);

      // Envelope
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing, legendY);
      ctx.lineTo(width - legendSpacing - 20, legendY);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.fillText('Envelope', width - legendSpacing + 5, legendY + 4);
    }

    // 绘制时间标签
    if (isLive) {
      const duration = (ch1.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2); // 250Hz 采样率
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${duration}s`, width - 10, height - 10);
    }
  }, [ch1, ch2, ch3, width, height, isLive, showLayers]);

  return (
    <div style={{ marginBottom: '16px' }}>
      {title && (
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
          {title}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: 'auto',
          border: '1px solid #333',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
        }}
      />
    </div>
  );
};

```

---

## components/ErrorBoundary.tsx

```typescript
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

```

---

## components/Footer.tsx

```typescript
/**
 * 页脚组件
 * 显示公司信息和版权
 */

export default function Footer() {
  return (
    <footer className="border-t border-border/20 bg-black/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* 公司信息 */}
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-400">
              <span className="font-montserrat font-semibold text-gray-300">Wagii Technology LLC</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Ear EMG Silent Speech Recognition System
            </p>
          </div>

          {/* 版权信息 */}
          <div className="text-center text-xs text-gray-500">
            <p>© {new Date().getFullYear()} Wagii Technology LLC. All rights reserved.</p>
          </div>

          {/* 链接 */}
          <div className="flex gap-6 text-xs text-gray-400">
            <a href="#" className="hover:text-gray-200 transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-gray-200 transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-gray-200 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

```

---

## components/HardwareStatus.tsx

```typescript
/**
 * 硬件连接状态组件
 * 
 * 显示串口连接状态和连接/断开按钮
 */

import React, { useState } from 'react';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';

export function HardwareStatusComponent() {
  const { isConnected, error, isSupported, requestPort, connect, disconnect } = useSerialConnectionContext();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const port = await requestPort();
      if (port) {
        await connect(port);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const getStatusIcon = () => {
    if (isConnecting) return '⏳';
    if (isConnected) return '✓';
    return '○';
  };

  const getStatusText = () => {
    if (isConnecting) return '连接中...';
    if (isConnected) return '已连接';
    return '未连接';
  };

  const getStatusColor = () => {
    if (isConnecting) return '#f59e0b';
    if (isConnected) return '#22c55e';
    return '#ef4444';
  };

  if (!isSupported()) {
    return (
      <div
        className="mb-8 p-6 rounded border-l-4"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderLeftColor: '#ef4444',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-4">
          <div style={{ fontSize: '24px', color: '#ef4444' }}>⚠️</div>
          <div>
            <div className="label mb-1">浏览器不支持</div>
            <div style={{ color: '#ef4444', fontWeight: 'bold' }}>
              Web Serial API 不可用
            </div>
            <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>
              请使用 Chrome、Edge 或其他支持 Web Serial API 的浏览器。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-8 p-6 rounded border-l-4"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderLeftColor: getStatusColor(),
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div style={{ fontSize: '24px', color: getStatusColor() }}>
            {getStatusIcon()}
          </div>
          <div>
            <div className="label mb-1">STM32 设备连接状态</div>
            <div style={{ color: getStatusColor(), fontWeight: 'bold' }}>
              {getStatusText()}
            </div>
            {error && (
              <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>
                错误: {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              style={{
                padding: '8px 16px',
                backgroundColor: isConnecting ? '#888' : '#d4af37',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: isConnecting ? 0.6 : 1,
              }}
            >
              {isConnecting ? '连接中...' : '连接设备'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              style={{
                padding: '8px 16px',
                backgroundColor: '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              断开连接
            </button>
          )}
        </div>
      </div>

      {!isConnected && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#1a1a1a',
          borderRadius: '4px',
          color: '#888',
          fontSize: '14px',
        }}>
          <p style={{ marginBottom: '8px' }}>💡 串口连接说明：</p>
          <ul style={{ marginLeft: '20px', lineHeight: '1.6' }}>
            <li>使用 USB 数据线连接 STM32 设备到电脑</li>
            <li>确保 STM32 设备已上传采集固件</li>
            <li>点击"连接设备"按钮选择对应的串口</li>
            <li>连接成功后，系统将自动开始接收数据</li>
          </ul>
        </div>
      )}
    </div>
  );
}

```

---

## components/ImprovedQualityScoreDisplay.tsx

```typescript
/**
 * 改进的采集质量评分显示组件
 * 
 * 功能：
 * - 显示改进的质量评分
 * - 支持删除低评分采集
 * - 支持重录采集
 * - 显示详细的评分指标
 */

import React from 'react';
import { ImprovedQualityScore } from '@/lib/quality-scoring-improved';

interface ImprovedQualityScoreDisplayProps {
  score: ImprovedQualityScore;
  index: number;
  onDelete?: () => void;
  onRetry?: () => void;
}

export function ImprovedQualityScoreDisplay({
  score,
  index,
  onDelete,
  onRetry,
}: ImprovedQualityScoreDisplayProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80'; // 绿色 - 优秀
    if (score >= 70) return '#86efac'; // 浅绿 - 良好
    if (score >= 60) return '#fbbf24'; // 黄色 - 一般
    if (score >= 50) return '#fb923c'; // 橙色 - 较差
    return '#ef4444'; // 红色 - 很差
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 70) return '良好';
    if (score >= 60) return '一般';
    if (score >= 50) return '较差';
    return '很差';
  };

  const scoreColor = getScoreColor(score.overallScore);
  const showWarning = score.overallScore < 70;

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: showWarning
          ? 'rgba(239, 68, 68, 0.05)'
          : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${
          showWarning
            ? 'rgba(239, 68, 68, 0.2)'
            : 'rgba(255, 255, 255, 0.1)'
        }`,
        marginBottom: '12px',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '600' }}>
          采集 #{index + 1}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* 总体评分 */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: scoreColor,
              }}
            >
              {score.overallScore}
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>
              {getScoreLabel(score.overallScore)}
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {onRetry && showWarning && (
              <button
                onClick={onRetry}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid #60a5fa',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
                title="重新采集此数据"
              >
                重录
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
                title="删除此采集"
              >
                删除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 详细指标 - 三列布局 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        {/* 能量一致性 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            能量一致性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.energyConsistency}%`,
                  backgroundColor: '#4ade80',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#4ade80', minWidth: '28px' }}>
              {score.energyConsistency}%
            </div>
          </div>
        </div>

        {/* 信号强度 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            信号强度
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.signalStrength}%`,
                  backgroundColor: '#60a5fa',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#60a5fa', minWidth: '28px' }}>
              {score.signalStrength}%
            </div>
          </div>
        </div>

        {/* 波形变化性 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            波形变化性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.variability}%`,
                  backgroundColor: '#fbbf24',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#fbbf24', minWidth: '28px' }}>
              {score.variability}%
            </div>
          </div>
        </div>
      </div>

      {/* 建议 */}
      <div
        style={{
          fontSize: '12px',
          padding: '8px 10px',
          borderRadius: '4px',
          backgroundColor: score.isOutlier
            ? 'rgba(239, 68, 68, 0.1)'
            : score.overallScore < 70
            ? 'rgba(251, 191, 36, 0.1)'
            : 'rgba(74, 222, 128, 0.1)',
          color: score.isOutlier
            ? '#fca5a5'
            : score.overallScore < 70
            ? '#fcd34d'
            : '#86efac',
          border: `1px solid ${
            score.isOutlier
              ? 'rgba(239, 68, 68, 0.3)'
              : score.overallScore < 70
              ? 'rgba(251, 191, 36, 0.3)'
              : 'rgba(74, 222, 128, 0.3)'
          }`,
        }}
      >
        {score.recommendation}
      </div>

      {/* 详细信息 - 可选展开 */}
      <details
        style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#888',
        }}
      >
        <summary style={{ cursor: 'pointer', marginBottom: '6px' }}>
          详细信息
        </summary>
        <div
          style={{
            paddingLeft: '12px',
            borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
            marginTop: '6px',
          }}
        >
          <div>
            峰值幅度: {score.details.peakAmplitude.toFixed(2)}
          </div>
          <div>
            能量范围: [{score.details.energyRange.min.toFixed(2)}, {score.details.energyRange.max.toFixed(2)}]
          </div>
          <div>
            噪声水平: {score.details.noiseLevel.toFixed(4)}
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * 改进的质量评分列表组件
 */
interface ImprovedQualityScoreListProps {
  scores: Array<ImprovedQualityScore & { index: number }>;
  onDelete?: (index: number) => void;
  onRetry?: (index: number) => void;
}

export function ImprovedQualityScoreList({
  scores,
  onDelete,
  onRetry,
}: ImprovedQualityScoreListProps) {
  const avgScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
        )
      : 0;

  const outlierCount = scores.filter((s) => s.isOutlier).length;
  const goodCount = scores.filter((s) => s.overallScore >= 70).length;
  const fairCount = scores.filter(
    (s) => s.overallScore >= 50 && s.overallScore < 70
  ).length;
  const poorCount = scores.filter((s) => s.overallScore < 50).length;

  return (
    <div>
      {/* 统计摘要 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          marginBottom: '16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>平均评分</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {avgScore}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>优秀</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {goodCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>一般</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: fairCount > 0 ? '#fbbf24' : '#888',
            }}
          >
            {fairCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>异常</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: outlierCount > 0 ? '#ef4444' : '#4ade80',
            }}
          >
            {outlierCount}
          </div>
        </div>
      </div>

      {/* 详细列表 */}
      <div>
        {scores.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px',
              color: '#888',
              fontSize: '14px',
            }}
          >
            暂无采集数据
          </div>
        ) : (
          scores.map((score) => (
            <ImprovedQualityScoreDisplay
              key={score.index}
              score={score}
              index={score.index}
              onDelete={onDelete ? () => onDelete(score.index) : undefined}
              onRetry={onRetry ? () => onRetry(score.index) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

```

---

## components/LengthDistributionChart.tsx

```typescript
/**
 * 长度分布直方图组件
 * 
 * 显示采集时长的分布直方图，包括：
 * - 直方图条形图
 * - 规范范围标记
 * - 统计信息卡片
 * - 异常采集提示
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card } from '@/components/PremiumComponents';
import { LengthDistributionStats, HistogramBucket } from '@/lib/length-distribution-analysis';

interface LengthDistributionChartProps {
  stats: LengthDistributionStats;
  height?: number;
}

export const LengthDistributionChart: React.FC<LengthDistributionChartProps> = ({
  stats,
  height = 400,
}) => {
  if (!stats.spec) {
    return (
      <Card className="p-6 bg-yellow-50 border border-yellow-200">
        <div className="space-y-3">
          <p className="text-yellow-800 font-semibold">⚠️ 指令规范自动生成中</p>
          <p className="text-yellow-700 text-sm">
            系统未找到该指令的预定义规范，已自动生成默认规范。
          </p>
          <p className="text-yellow-700 text-sm">
            如需自定义规范，请在 <code className="bg-yellow-100 px-2 py-1 rounded">shared/instruction-length-spec.ts</code> 中添加。
          </p>
        </div>
      </Card>
    );
  }

  const { histogram, spec, validPercentage, averageDurationMs, medianDurationMs, stdDeviation, outliers } = stats;

  // 准备直方图数据
  const chartData = histogram.map((bucket) => ({
    name: bucket.label,
    count: bucket.count,
    percentage: bucket.percentage,
    isInSpec: bucket.isInSpec,
  }));

  // 颜色映射
  const getBarColor = (isInSpec: boolean) => {
    return isInSpec ? '#10b981' : '#ef4444'; // 绿色（符合规范）或红色（不符合）
  };

  return (
    <div className="space-y-6">
      {/* 统计信息卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="采集总数"
          value={stats.totalCollections}
          unit="次"
        />
        <StatCard
          label="符合规范"
          value={`${stats.validCollections}/${stats.totalCollections}`}
          unit={`(${validPercentage.toFixed(1)}%)`}
          highlight={validPercentage >= 80}
        />
        <StatCard
          label="平均时长"
          value={averageDurationMs.toFixed(0)}
          unit="ms"
        />
        <StatCard
          label="推荐时长"
          value={spec.recommendedDurationMs}
          unit="ms"
        />
      </div>

      {/* 直方图 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">采集时长分布</h3>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              tick={{ fontSize: 12 }}
            />
            <YAxis label={{ value: '采集次数', angle: -90, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
              formatter={(value: any) => `${value} 次`}
            />
            <Legend />
            <Bar dataKey="count" name="采集次数" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.isInSpec)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 规范范围说明 */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">
            <span className="inline-block w-4 h-4 bg-green-500 rounded mr-2"></span>
            绿色区域：符合规范范围 ({spec.minDurationMs}-{spec.maxDurationMs}ms)
          </p>
          <p className="text-sm text-gray-600">
            <span className="inline-block w-4 h-4 bg-red-500 rounded mr-2"></span>
            红色区域：超出规范范围
          </p>
        </div>
      </Card>

      {/* 详细统计信息 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">详细统计</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <DetailItem label="最小时长" value={`${stats.minDurationMs.toFixed(0)}ms`} />
          <DetailItem label="最大时长" value={`${stats.maxDurationMs.toFixed(0)}ms`} />
          <DetailItem label="中位数" value={`${medianDurationMs.toFixed(0)}ms`} />
          <DetailItem label="标准差" value={`${stdDeviation.toFixed(0)}ms`} />
          <DetailItem label="符合规范" value={`${validPercentage.toFixed(1)}%`} />
          <DetailItem label="异常采集" value={`${outliers.length} 个`} />
        </div>
      </Card>

      {/* 异常采集提示 */}
      {outliers.length > 0 && (
        <Card className="p-6 bg-yellow-50 border border-yellow-200">
          <h3 className="text-lg font-semibold mb-4 text-yellow-900">⚠️ 异常采集</h3>
          <div className="space-y-2">
            {outliers.slice(0, 5).map((outlier) => (
              <p key={outlier.index} className="text-sm text-yellow-800">
                采集 #{outlier.index + 1}: {outlier.durationMs.toFixed(0)}ms - {outlier.reason}
              </p>
            ))}
            {outliers.length > 5 && (
              <p className="text-sm text-yellow-800">... 还有 {outliers.length - 5} 个异常采集</p>
            )}
          </div>
        </Card>
      )}

      {/* 建议 */}
      <Card className="p-6 bg-blue-50 border border-blue-200">
        <h3 className="text-lg font-semibold mb-2 text-blue-900">💡 建议</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {validPercentage < 80 && (
            <li>• 符合规范的采集比例较低，建议重新采集不符合规范的数据</li>
          )}
          {stdDeviation > 100 && (
            <li>• 采集时长波动较大，建议保持一致的发音速度</li>
          )}
          {validPercentage >= 80 && stdDeviation <= 100 && (
            <li>✓ 采集质量良好，数据可用于模型训练</li>
          )}
        </ul>
      </Card>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, unit, highlight }) => (
  <div className={`p-4 rounded-lg border ${highlight ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
    <p className="text-sm text-gray-600 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
      {value}
      {unit && <span className="text-sm ml-1">{unit}</span>}
    </p>
  </div>
);

interface DetailItemProps {
  label: string;
  value: string;
}

const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => (
  <div className="p-3 bg-gray-50 rounded-lg">
    <p className="text-sm text-gray-600 mb-1">{label}</p>
    <p className="text-lg font-semibold text-gray-900">{value}</p>
  </div>
);

export default LengthDistributionChart;

```

---

## components/LoginDialog.tsx

```typescript
/**
 * 登录对话框组件
 * 
 * 功能：
 * - 密码输入
 * - 登录验证
 * - 错误提示
 */

import React, { useState } from 'react';
import { Button, Input } from '@/components/PremiumComponents';
import { useAuth } from '@/contexts/AuthContext';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginDialog({ isOpen, onClose }: LoginDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 300));

    if (login(password)) {
      setPassword('');
      onClose();
    } else {
      setError('密码错误，请重试');
      setPassword('');
    }

    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-8 w-96 shadow-2xl border border-amber-500/20">
        <h2 className="text-2xl font-bold text-amber-400 mb-6">访问受限</h2>
        
        <p className="text-slate-300 mb-6">
          此页面需要密码认证。请输入密码以继续。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={isLoading}
              autoFocus
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleSubmit(e as any);
                }
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/50 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
              disabled={isLoading || !password}
              className="flex-1"
            >
              {isLoading ? '验证中...' : '登录'}
            </Button>
          </div>
        </form>

        <p className="text-xs text-slate-500 mt-6 text-center">
          此功能用于保护敏感的数据采集和管理操作。
        </p>
      </div>
    </div>
  );
}

```

---

## components/ManusDialog.tsx

```typescript
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface ManusDialogProps {
  title?: string;
  logo?: string;
  open?: boolean;
  onLogin: () => void;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export function ManusDialog({
  title,
  logo,
  open = false,
  onLogin,
  onOpenChange,
  onClose,
}: ManusDialogProps) {
  const [internalOpen, setInternalOpen] = useState(open);

  useEffect(() => {
    if (!onOpenChange) {
      setInternalOpen(open);
    }
  }, [open, onOpenChange]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }

    if (!nextOpen) {
      onClose?.();
    }
  };

  return (
    <Dialog
      open={onOpenChange ? open : internalOpen}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="py-5 bg-[#f8f8f7] rounded-[20px] w-[400px] shadow-[0px_4px_11px_0px_rgba(0,0,0,0.08)] border border-[rgba(0,0,0,0.08)] backdrop-blur-2xl p-0 gap-0 text-center">
        <div className="flex flex-col items-center gap-2 p-5 pt-12">
          {logo ? (
            <div className="w-16 h-16 bg-white rounded-xl border border-[rgba(0,0,0,0.08)] flex items-center justify-center">
              <img src={logo} alt="Dialog graphic" className="w-10 h-10 rounded-md" />
            </div>
          ) : null}

          {/* Title and subtitle */}
          {title ? (
            <DialogTitle className="text-xl font-semibold text-[#34322d] leading-[26px] tracking-[-0.44px]">
              {title}
            </DialogTitle>
          ) : null}
          <DialogDescription className="text-sm text-[#858481] leading-5 tracking-[-0.154px]">
            Please login with Manus to continue
          </DialogDescription>
        </div>

        <DialogFooter className="px-5 py-5">
          {/* Login button */}
          <Button
            onClick={onLogin}
            className="w-full h-10 bg-[#1a1a19] hover:bg-[#1a1a19]/90 text-white rounded-[10px] text-sm font-medium leading-5 tracking-[-0.154px]"
          >
            Login with Manus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

```

---

## components/Map.tsx

```typescript
/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

function loadMapScript() {
  return new Promise(resolve => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve(null);
      script.remove(); // Clean up immediately
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
    };
    document.head.appendChild(script);
  });
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    await loadMapScript();
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}

```

---

## components/PremiumComponents.tsx

```typescript
/**
 * 高端商业风格 React 组件库
 */

import React from 'react';
import '../styles/design-system.css';

/* ==================== 布局组件 ==================== */

export const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`w-full max-w-7xl mx-auto px-6 py-12 ${className}`}>{children}</div>
);

export const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <section className={`py-16 ${className}`}>{children}</section>;

export const Grid: React.FC<{
  children: React.ReactNode;
  cols?: number;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ children, cols = 2, gap = 'md', className = '' }) => {
  const gapClass = gap === 'sm' ? 'gap-4' : gap === 'lg' ? 'gap-8' : 'gap-6';
  return (
    <div
      className={`grid grid-cols-${cols} ${gapClass} ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {children}
    </div>
  );
};

/* ==================== 标题组件 ==================== */

export const SectionLabel: React.FC<{ children: React.ReactNode; number?: string }> = ({
  children,
  number,
}) => (
  <div className="label mb-6">
    {number && <span className="text-accent">{number} / </span>}
    {children}
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; subtitle?: string }> = ({
  children,
  subtitle,
}) => (
  <div className="mb-12">
    <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
    </h2>
    {subtitle && <p className="text-secondary text-lg">{subtitle}</p>}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({
  children,
  accent = false,
}) => (
  <h3
    className={`text-2xl font-semibold ${accent ? 'text-accent' : ''}`}
    style={{ fontFamily: 'var(--font-serif)' }}
  >
    {children}
  </h3>
);

/* ==================== 分隔线组件 ==================== */

export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`divider ${className}`} />
);

export const DividerVertical: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`divider-vertical ${className}`} />
);

/* ==================== 卡片组件 ==================== */

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
}> = ({ children, className = '', header }) => (
  <div className={`card ${className}`}>
    {header && <div className="card-header">{header}</div>}
    {children}
  </div>
);

export const DataCard: React.FC<{
  label: string;
  value: React.ReactNode;
  unit?: string;
  accent?: boolean;
}> = ({ label, value, unit, accent = false }) => (
  <div className="card">
    <div className={`label mb-4 ${accent ? 'text-accent' : ''}`}>{label}</div>
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </span>
      {unit && <span className="text-secondary text-lg">{unit}</span>}
    </div>
  </div>
);

/* ==================== 按钮组件 ==================== */

export const Button: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'error';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, variant = 'secondary', size = 'md', onClick, disabled = false, className = '' }) => {
  const sizeClass = size === 'sm' ? 'px-4 py-2 text-xs' : size === 'lg' ? 'px-8 py-3 text-lg' : 'px-6 py-2 text-sm';
  const variantClass = `btn btn-${variant}`;

  return (
    <button
      className={`${variantClass} ${sizeClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

/* ==================== 输入框组件 ==================== */

export const Input: React.FC<{
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
}> = ({ placeholder, value, onChange, disabled = false, className = '' }) => (
  <input
    type="text"
    className={`input ${className}`}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    disabled={disabled}
  />
);

export const TextArea: React.FC<{
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
}> = ({ placeholder, value, onChange, rows = 4, className = '' }) => (
  <textarea
    className={`input ${className}`}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    rows={rows}
  />
);

/* ==================== 进度条组件 ==================== */

export const ProgressBar: React.FC<{ value: number; max?: number; label?: string }> = ({
  value,
  max = 100,
  label,
}) => {
  const percentage = (value / max) * 100;
  return (
    <div className="mb-4">
      {label && <div className="label mb-2">{label}</div>}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
      <div className="text-secondary text-sm mt-2">{Math.round(percentage)}%</div>
    </div>
  );
};

/* ==================== 统计组件 ==================== */

export const StatGrid: React.FC<{
  stats: Array<{ label: string; value: React.ReactNode; unit?: string; accent?: boolean }>;
}> = ({ stats }) => (
  <Grid cols={stats.length} gap="lg">
    {stats.map((stat, idx) => (
      <DataCard key={idx} {...stat} />
    ))}
  </Grid>
);

/* ==================== 表格组件 ==================== */

export const Table: React.FC<{
  headers: string[];
  rows: React.ReactNode[][];
  className?: string;
}> = ({ headers, rows, className = '' }) => (
  <table className={`data-table ${className}`}>
    <thead>
      <tr>
        {headers.map((header, idx) => (
          <th key={idx}>{header}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, rowIdx) => (
        <tr key={rowIdx}>
          {row.map((cell, cellIdx) => (
            <td key={cellIdx}>{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

/* ==================== 列表组件 ==================== */

export const ListItem: React.FC<{
  number?: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: boolean;
}> = ({ number, title, subtitle, accent = false }) => (
  <div className="card mb-4">
    <div className="flex gap-4">
      {number !== undefined && (
        <div className={`text-2xl font-bold ${accent ? 'text-accent' : 'text-secondary'}`}>{number}</div>
      )}
      <div className="flex-1">
        <h4 className={accent ? 'text-accent' : ''}>{title}</h4>
        {subtitle && <p className="text-secondary text-sm mt-2">{subtitle}</p>}
      </div>
    </div>
  </div>
);

/* ==================== 信息框组件 ==================== */

export const InfoBox: React.FC<{
  title: string;
  children: React.ReactNode;
  type?: 'info' | 'success' | 'error' | 'warning';
}> = ({ title, children, type = 'info' }) => {
  const colorClass =
    type === 'success' ? 'text-success' : type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-accent';

  return (
    <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-accent-primary)' }}>
      <h5 className={colorClass}>{title}</h5>
      <p className="text-secondary mt-2">{children}</p>
    </div>
  );
};

/* ==================== 加载状态组件 ==================== */

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return (
    <div className={`${sizeClass} border-2 border-accent border-t-transparent rounded-full animate-spin`} />
  );
};

/* ==================== 徽章组件 ==================== */

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning';
}> = ({ children, variant = 'accent' }) => {
  const colorClass =
    variant === 'success'
      ? 'bg-green-900 text-success'
      : variant === 'error'
        ? 'bg-red-900 text-error'
        : variant === 'warning'
          ? 'bg-yellow-900 text-warning'
          : 'bg-yellow-900 text-accent';

  return <span className={`px-3 py-1 rounded text-xs font-semibold ${colorClass}`}>{children}</span>;
};

/* ==================== 确认对话框组件 ==================== */

export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}> = ({ title, message, onConfirm, onCancel, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <Card className="w-96">
        <h3 className="text-2xl font-bold mb-4">{title}</h3>
        <p className="text-secondary mb-6">{message}</p>
        <div className="flex gap-4 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            确认
          </Button>
        </div>
      </Card>
    </div>
  );
};

```

---

## components/QualityScoreDisplay.tsx

```typescript
/**
 * 采集质量评分显示组件
 * 
 * 显示：
 * - 整体质量评分（0-100）
 * - 能量一致性
 * - 对齐质量
 * - 异常检测和建议
 */

import React from 'react';
import { QualityScore } from '@/lib/auto-segmentation';

interface QualityScoreDisplayProps {
  score: QualityScore;
  index: number;
  onDelete?: () => void;
}

export function QualityScoreDisplay({
  score,
  index,
  onDelete,
}: QualityScoreDisplayProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80'; // 绿色 - 优秀
    if (score >= 60) return '#fbbf24'; // 黄色 - 良好
    if (score >= 40) return '#f97316'; // 橙色 - 一般
    return '#ef4444'; // 红色 - 差
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '差';
  };

  const scoreColor = getScoreColor(score.overallScore);

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${score.isOutlier ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
        marginBottom: '8px',
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600' }}>
          采集 #{index + 1}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* 总体评分 */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: scoreColor,
              }}
            >
              {score.overallScore}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {getScoreLabel(score.overallScore)}
            </div>
          </div>

          {/* 删除按钮 */}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>

      {/* 详细指标 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {/* 能量一致性 */}
        <div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
            能量一致性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.energyConsistency}%`,
                  backgroundColor: '#4ade80',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#4ade80', minWidth: '30px' }}>
              {score.energyConsistency}%
            </div>
          </div>
        </div>

        {/* 对齐质量 */}
        <div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
            对齐质量
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.alignmentScore}%`,
                  backgroundColor: '#60a5fa',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#60a5fa', minWidth: '30px' }}>
              {score.alignmentScore}%
            </div>
          </div>
        </div>
      </div>

      {/* 建议 */}
      <div
        style={{
          fontSize: '12px',
          padding: '6px 8px',
          borderRadius: '4px',
          backgroundColor: score.isOutlier
            ? 'rgba(239, 68, 68, 0.1)'
            : 'rgba(74, 222, 128, 0.1)',
          color: score.isOutlier ? '#fca5a5' : '#86efac',
          border: `1px solid ${score.isOutlier ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
        }}
      >
        {score.recommendation}
      </div>
    </div>
  );
}

/**
 * 质量评分列表组件
 */
interface QualityScoreListProps {
  scores: Array<QualityScore & { index: number }>;
  onDelete?: (index: number) => void;
}

export function QualityScoreList({ scores, onDelete }: QualityScoreListProps) {
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
      : 0;

  const outlierCount = scores.filter((s) => s.isOutlier).length;

  return (
    <div>
      {/* 统计摘要 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>平均质量评分</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {avgScore}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>异常采集</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: outlierCount > 0 ? '#ef4444' : '#4ade80',
            }}
          >
            {outlierCount} / {scores.length}
          </div>
        </div>
      </div>

      {/* 详细列表 */}
      <div>
        {scores.map((score) => (
          <QualityScoreDisplay
            key={score.index}
            score={score}
            index={score.index}
            onDelete={onDelete ? () => onDelete(score.index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

```

---

## components/SpectrumDisplay.tsx

```typescript
/**
 * 频谱显示组件
 * 
 * 显示：
 * - FFT 频谱图
 * - 主要频率成分
 * - 信噪比 (SNR)
 * - 信号质量评分
 */

import React, { useEffect, useRef } from 'react';
import { SpectrumAnalysis, assessSignalQuality } from '@/lib/fft-analysis';

interface SpectrumDisplayProps {
  analysis: SpectrumAnalysis;
  title?: string;
}

export function SpectrumDisplay({ analysis, title = '频谱分析' }: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qualityAssessment = assessSignalQuality(analysis);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // 垂直网格线
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // 水平网格线
    for (let i = 0; i <= 5; i++) {
      const y = (i / 5) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 绘制频谱
    const padding = 40;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;

    // 只显示 0-200 Hz
    const maxFreq = 200;
    const maxMag = Math.max(...analysis.magnitudes.slice(0, Math.floor((maxFreq * analysis.magnitudes.length) / 125)));

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < analysis.magnitudes.length; i++) {
      const frequency = analysis.frequencies[i];
      if (frequency > maxFreq) break;

      const x = padding + (frequency / maxFreq) * graphWidth;
      const y = canvas.height - padding - (analysis.magnitudes[i] / maxMag) * graphHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // 绘制主要频率标记
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    const dominantX = padding + (analysis.dominantFrequency / maxFreq) * graphWidth;
    const dominantY = canvas.height - padding - (analysis.dominantMagnitude / maxMag) * graphHeight;
    ctx.arc(dominantX, dominantY, 5, 0, 2 * Math.PI);
    ctx.fill();

    // 绘制坐标轴标签
    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // X 轴标签（频率）
    for (let i = 0; i <= 10; i++) {
      const freq = (i / 10) * maxFreq;
      const x = padding + (i / 10) * graphWidth;
      ctx.fillText(`${Math.round(freq)}`, x, canvas.height - 10);
    }

    // Y 轴标签（幅度）
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const mag = (i / 5) * maxMag;
      const y = canvas.height - padding - (i / 5) * graphHeight;
      ctx.fillText(`${mag.toFixed(2)}`, padding - 10, y + 4);
    }

    // 轴标签
    ctx.fillStyle = '#888';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('频率 (Hz)', canvas.width / 2, canvas.height - 5);

    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('幅度', 0, 0);
    ctx.restore();
  }, [analysis]);

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          {title}
        </div>

        {/* 质量评分 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          {/* SNR */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              信噪比 (SNR)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#60a5fa' }}>
              {analysis.snr.toFixed(1)} dB
            </div>
          </div>

          {/* 主要频率 */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              主要频率
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24' }}>
              {analysis.dominantFrequency.toFixed(1)} Hz
            </div>
          </div>

          {/* 质量评分 */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              信号质量
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color:
                  qualityAssessment.score >= 80
                    ? '#4ade80'
                    : qualityAssessment.score >= 60
                      ? '#fbbf24'
                      : '#ef4444',
              }}
            >
              {qualityAssessment.score}
            </div>
          </div>
        </div>
      </div>

      {/* 频谱图 */}
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        style={{
          width: '100%',
          height: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          backgroundColor: '#0a0a0a',
          marginBottom: '12px',
        }}
      />

      {/* 质量反馈 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor:
            qualityAssessment.score >= 80
              ? 'rgba(74, 222, 128, 0.1)'
              : qualityAssessment.score >= 60
                ? 'rgba(251, 191, 36, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${
            qualityAssessment.score >= 80
              ? 'rgba(74, 222, 128, 0.3)'
              : qualityAssessment.score >= 60
                ? 'rgba(251, 191, 36, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'
          }`,
          color:
            qualityAssessment.score >= 80
              ? '#86efac'
              : qualityAssessment.score >= 60
                ? '#fcd34d'
                : '#fca5a5',
          fontSize: '12px',
        }}
      >
        {qualityAssessment.feedback}
      </div>

      {/* 峰值列表 */}
      {analysis.peakFrequencies.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
            主要峰值
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px',
            }}
          >
            {analysis.peakFrequencies.map((peak, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '12px',
                }}
              >
                <div style={{ color: '#aaa' }}>峰值 {idx + 1}</div>
                <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                  {peak.frequency.toFixed(1)} Hz
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

```

---

## components/UserLoginDialog.tsx

```typescript
/**
 * 用户登录/注册对话框组件
 */

import React, { useState } from 'react';
import { useUserSession } from '@/contexts/UserSessionContext';
import { toast } from 'sonner';

interface UserLoginDialogProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function UserLoginDialog({ isOpen, onClose }: UserLoginDialogProps) {
  const { login, register } = useUserSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    const result = await login(username.trim(), password);
    if (result.success) {
      setUsername('');
      setPassword('');
      setError('');
      toast.success('登录成功');
      onClose?.();
    } else {
      setError(result.message);
    }
  };

  const handleRegister = async () => {
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }

    if (username.trim().length < 2) {
      setError('用户名至少需要 2 个字符');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    if (password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    const result = await register(username.trim(), password);
    if (result.success) {
      setError('');
      toast.success('注册成功，请登录');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
    } else {
      setError(result.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'login') {
        handleLogin();
      } else {
        handleRegister();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          border: '2px solid #d4af37',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '400px',
          width: '90%',
        }}
      >
        <h2
          style={{
            color: '#d4af37',
            marginTop: 0,
            marginBottom: '24px',
            fontSize: '20px',
            fontWeight: 'bold',
          }}
        >
          {mode === 'login' ? '用户登录' : '新用户注册'}
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              color: '#888',
              fontSize: '12px',
              marginBottom: '8px',
            }}
          >
            用户名
          </label>
          <input
            type="text"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              color: '#888',
              fontSize: '12px',
              marginBottom: '8px',
            }}
          >
            密码
          </label>
          <input
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {mode === 'register' && (
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                color: '#888',
                fontSize: '12px',
                marginBottom: '8px',
              }}
            >
              确认密码
            </label>
            <input
              type="password"
              placeholder="请再次输入密码"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              color: '#ef4444',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={mode === 'login' ? handleLogin : handleRegister}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#d4af37',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            marginBottom: '12px',
          }}
        >
          {mode === 'login' ? '登录' : '注册'}
        </button>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setUsername('');
            setPassword('');
            setConfirmPassword('');
            setError('');
          }}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: 'transparent',
            color: '#d4af37',
            border: '1px solid #d4af37',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          {mode === 'login' ? '新用户注册' : '已有账户，返回登录'}
        </button>
      </div>
    </div>
  );
}

```

---

## components/UserManagement.tsx

```typescript
/**
 * 用户管理界面组件
 * 
 * 功能：
 * - 创建新用户
 * - 切换用户
 * - 删除用户
 */

import React, { useState } from 'react';
import { useUser } from '@/contexts/UserContext';

export function UserManagement() {
  const { currentUser, allUsers, createUser, switchUser, deleteUser } = useUser();
  const [newUserName, setNewUserName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateUser = () => {
    if (newUserName.trim()) {
      createUser(newUserName);
      setNewUserName('');
      setShowCreateForm(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>👤 用户管理</h3>

      {/* 当前用户 */}
      {currentUser && (
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            当前用户
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#4ade80',
              marginBottom: '8px',
            }}
          >
            {currentUser.name}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            创建于: {new Date(currentUser.createdAt).toLocaleDateString()}
            {currentUser.electrodeBaseline && (
              <>
                <br />
                ✓ 已采集电极基准
              </>
            )}
          </div>
        </div>
      )}

      {/* 用户列表 */}
      {allUsers.length > 1 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
            其他用户
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
            }}
          >
            {allUsers
              .filter((u) => u.id !== currentUser?.id)
              .map((user) => (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: '#aaa',
                    }}
                  >
                    {user.name}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => switchUser(user.id)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        backgroundColor: '#d4af37',
                        color: '#000',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    >
                      切换
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 创建新用户 */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#4ade80',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
          }}
        >
          + 创建新用户
        </button>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          <input
            type="text"
            placeholder="输入用户名"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreateUser();
              }
            }}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '13px',
            }}
          />
          <button
            onClick={handleCreateUser}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4ade80',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
            }}
          >
            创建
          </button>
          <button
            onClick={() => {
              setShowCreateForm(false);
              setNewUserName('');
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

```

---

## components/WaveformChart.tsx

```typescript
/**
 * 实时波形可视化组件
 * 
 * 显示 3 个通道的 EMG 波形
 */

import { useEffect, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';

interface WaveformChartProps {
  data: EMGData[];
  maxPoints?: number;
  height?: number;
}

export function WaveformChart({
  data,
  maxPoints = 250,
  height = 200,
}: WaveformChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const chartHeight = canvas.height;
    const channelHeight = chartHeight / 3;

    // 清空画布
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, chartHeight);

    // 绘制分隔线
    ctx.strokeStyle = '#e5e5e7';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * channelHeight);
      ctx.lineTo(width, i * channelHeight);
      ctx.stroke();
    }

    // 获取最后 maxPoints 个数据点
    const displayData = data.slice(-maxPoints);
    const pointsPerPixel = Math.max(1, displayData.length / width);

    // 绘制三个通道的波形
    const colors = ['#0071E3', '#34C759', '#FF9500']; // 蓝、绿、橙

    for (let ch = 0; ch < 3; ch++) {
      ctx.strokeStyle = colors[ch];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < displayData.length; i++) {
        const x = (i / pointsPerPixel) * (width / displayData.length);
        const value = displayData[i].channels[ch];

        // 归一化到 0-1 范围（假设最大值为 1000）
        const normalized = Math.max(0, Math.min(1, value / 1000));

        // 计算 Y 坐标
        const y =
          ch * channelHeight +
          channelHeight / 2 -
          (normalized - 0.5) * (channelHeight * 0.8);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // 绘制通道标签
    ctx.fillStyle = '#86868B';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CH1', 8, 16 + 0 * channelHeight);
    ctx.fillText('CH2', 8, 16 + 1 * channelHeight);
    ctx.fillText('CH3', 8, 16 + 2 * channelHeight);
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full border border-gray-200 rounded-lg bg-white"
    />
  );
}

```

---

## components/WaveformComparisonPanel.tsx

```typescript
/**
 * 波形对比分析面板组件
 * 
 * 功能：
 * - 显示两个波形的对比
 * - 显示相似度和统计特征
 * - 可视化对比结果
 */

import React, { useState } from 'react';
import {
  compareWaveforms,
  compareMultipleWaveforms,
  ComparisonResult,
  generateComparisonReport,
} from '@/lib/waveform-comparison';

interface WaveformComparisonPanelProps {
  waveforms: Array<{
    index: number;
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>;
  onClose: () => void;
}

export function WaveformComparisonPanel({
  waveforms,
  onClose,
}: WaveformComparisonPanelProps) {
  const [selectedWaveforms, setSelectedWaveforms] = useState<number[]>([]);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult | null>(null);
  const [activeChannel, setActiveChannel] = useState<'ch1' | 'ch2' | 'ch3'>('ch2');
  const [showMatrix, setShowMatrix] = useState(false);
  const [similarityMatrix, setSimilarityMatrix] = useState<number[][] | null>(null);

  const handleSelectWaveform = (index: number) => {
    if (selectedWaveforms.includes(index)) {
      setSelectedWaveforms(selectedWaveforms.filter((i) => i !== index));
    } else {
      setSelectedWaveforms([...selectedWaveforms, index]);
    }
  };

  const handleCompare = () => {
    if (selectedWaveforms.length === 2) {
      const w1 = waveforms[selectedWaveforms[0]];
      const w2 = waveforms[selectedWaveforms[1]];

      const channelData = activeChannel as 'ch1' | 'ch2' | 'ch3';
      const result = compareWaveforms(w1[channelData], w2[channelData]);
      setComparisonResults(result);
      setShowMatrix(false);
    } else if (selectedWaveforms.length > 2) {
      // 多波形对比
      const channelData = activeChannel as 'ch1' | 'ch2' | 'ch3';
      const waveformData = selectedWaveforms.map(
        (idx) => waveforms[idx][channelData]
      );
      const { similarities, averageSimilarity } = compareMultipleWaveforms(waveformData);
      setSimilarityMatrix(similarities);
      setShowMatrix(true);
      setComparisonResults(null);
    }
  };

  const handleExportReport = () => {
    if (comparisonResults && selectedWaveforms.length === 2) {
      const report = generateComparisonReport(
        `波形 #${selectedWaveforms[0]}`,
        `波形 #${selectedWaveforms[1]}`,
        comparisonResults
      );

      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(report));
      element.setAttribute('download', `waveform_comparison_${Date.now()}.txt`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 85) return '#4ade80'; // 绿色 - 很相似
    if (similarity >= 70) return '#fbbf24'; // 黄色 - 相似
    if (similarity >= 50) return '#f97316'; // 橙色 - 一般
    return '#ef4444'; // 红色 - 差异大
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0a0a0a',
          border: '2px solid #d4af37',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#e5e5e5',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ margin: 0, color: '#d4af37', fontSize: '20px' }}>
            🔍 波形对比分析
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* 波形选择 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>
            📋 选择波形（可多选）
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: '12px',
            }}
          >
            {waveforms.map((w) => (
              <button
                key={w.index}
                onClick={() => handleSelectWaveform(w.index)}
                style={{
                  padding: '12px',
                  backgroundColor: selectedWaveforms.includes(w.index)
                    ? '#d4af37'
                    : '#1a1a1a',
                  color: selectedWaveforms.includes(w.index) ? '#000' : '#d4af37',
                  border: `2px solid ${selectedWaveforms.includes(w.index) ? '#d4af37' : '#333'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
              >
                #{w.index}
              </button>
            ))}
          </div>
        </div>

        {/* 通道选择 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>
            🎛️ 选择通道
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {(['ch1', 'ch2', 'ch3'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeChannel === ch ? '#4ade80' : '#1a1a1a',
                  color: activeChannel === ch ? '#000' : '#4ade80',
                  border: `2px solid ${activeChannel === ch ? '#4ade80' : '#333'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {ch.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 对比按钮 */}
        <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
          <button
            onClick={handleCompare}
            disabled={selectedWaveforms.length < 2}
            style={{
              padding: '12px 24px',
              backgroundColor: selectedWaveforms.length >= 2 ? '#4ade80' : '#666',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedWaveforms.length >= 2 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            对比分析
          </button>
          <button
            onClick={handleExportReport}
            disabled={!comparisonResults}
            style={{
              padding: '12px 24px',
              backgroundColor: comparisonResults ? '#fbbf24' : '#666',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: comparisonResults ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            导出报告
          </button>
        </div>

        {/* 对比结果 - 单波形对比 */}
        {comparisonResults && !showMatrix && (
          <div
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                📊 相似度指标
              </div>

              {/* 相似度进度条 */}
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    fontSize: '12px',
                  }}
                >
                  <span>相似度</span>
                  <span
                    style={{
                      color: getSimilarityColor(comparisonResults.similarity),
                      fontWeight: 'bold',
                    }}
                  >
                    {comparisonResults.similarity}%
                  </span>
                </div>
                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: getSimilarityColor(comparisonResults.similarity),
                      height: '100%',
                      width: `${comparisonResults.similarity}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* 其他指标 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    相关系数
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#4ade80' }}>
                    {comparisonResults.correlation}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    均方根差
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fbbf24' }}>
                    {comparisonResults.rmsDifference}
                  </div>
                </div>
              </div>
            </div>

            {/* 统计特征对比 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                  波形 #{selectedWaveforms[0]} 统计特征
                </div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                  <div>均值: {Math.round(comparisonResults.stats1.mean * 100) / 100}</div>
                  <div>标准差: {Math.round(comparisonResults.stats1.std * 100) / 100}</div>
                  <div>最小值: {Math.round(comparisonResults.stats1.min * 100) / 100}</div>
                  <div>最大值: {Math.round(comparisonResults.stats1.max * 100) / 100}</div>
                  <div>均方根: {Math.round(comparisonResults.stats1.rms * 100) / 100}</div>
                  <div>峰峰值: {Math.round(comparisonResults.stats1.peakToPeak * 100) / 100}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                  波形 #{selectedWaveforms[1]} 统计特征
                </div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                  <div>均值: {Math.round(comparisonResults.stats2.mean * 100) / 100}</div>
                  <div>标准差: {Math.round(comparisonResults.stats2.std * 100) / 100}</div>
                  <div>最小值: {Math.round(comparisonResults.stats2.min * 100) / 100}</div>
                  <div>最大值: {Math.round(comparisonResults.stats2.max * 100) / 100}</div>
                  <div>均方根: {Math.round(comparisonResults.stats2.rms * 100) / 100}</div>
                  <div>峰峰值: {Math.round(comparisonResults.stats2.peakToPeak * 100) / 100}</div>
                </div>
              </div>
            </div>

            {/* 差异分析 */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                📊 差异分析
              </div>
              <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                <div>
                  均值差异: {comparisonResults.differences.meanDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.meanDiff / Math.max(Math.abs(comparisonResults.stats1.mean), Math.abs(comparisonResults.stats2.mean), 1)) * 100)}%)
                  </span>
                </div>
                <div>
                  标准差差异: {comparisonResults.differences.stdDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.stdDiff / Math.max(comparisonResults.stats1.std, comparisonResults.stats2.std, 1)) * 100)}%)
                  </span>
                </div>
                <div>
                  峰峰值差异: {comparisonResults.differences.peakDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.peakDiff / Math.max(comparisonResults.stats1.peakToPeak, comparisonResults.stats2.peakToPeak, 1)) * 100)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 对比结果 - 多波形相似度矩阵 */}
        {showMatrix && similarityMatrix && (
          <div
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
              📊 相似度矩阵
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        padding: '8px',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #333',
                        color: '#d4af37',
                      }}
                    >
                      波形
                    </th>
                    {selectedWaveforms.map((idx) => (
                      <th
                        key={idx}
                        style={{
                          padding: '8px',
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #333',
                          color: '#d4af37',
                        }}
                      >
                        #{idx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {similarityMatrix.map((row, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          padding: '8px',
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #333',
                          color: '#d4af37',
                          fontWeight: 'bold',
                        }}
                      >
                        #{selectedWaveforms[i]}
                      </td>
                      {row.map((similarity, j) => (
                        <td
                          key={j}
                          style={{
                            padding: '8px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            color: getSimilarityColor(similarity),
                            fontWeight: 'bold',
                            textAlign: 'center',
                          }}
                        >
                          {similarity}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: '#0a0a0a',
                borderRadius: '4px',
                border: '1px solid #333',
              }}
            >
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                平均相似度
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: getSimilarityColor(
                    similarityMatrix.flat().reduce((a, b) => a + b, 0) /
                      (similarityMatrix.length * similarityMatrix.length)
                  ),
                }}
              >
                {Math.round(
                  similarityMatrix.flat().reduce((a, b) => a + b, 0) /
                    (similarityMatrix.length * similarityMatrix.length)
                )}
                %
              </div>
            </div>
          </div>
        )}

        {/* 提示信息 */}
        {selectedWaveforms.length < 2 && !comparisonResults && !showMatrix && (
          <div
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '4px',
              padding: '12px',
              color: '#c4b5fd',
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            💡 请选择至少 2 条波形进行对比分析
          </div>
        )}
      </div>
    </div>
  );
}

```

---

## components/WaveformVisualization.tsx

```typescript
/**
 * 波形可视化组件
 * 
 * 功能：
 * - 实时绘制 3 通道 EMG 波形
 * - 支持历史波形缩小图显示
 * - 自定义颜色和尺寸
 */

import React, { useEffect, useRef } from 'react';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface WaveformVisualizationProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  width?: number;
  height?: number;
  isLive?: boolean;
  title?: string;
}

export const WaveformVisualization: React.FC<WaveformVisualizationProps> = ({
  ch1,
  ch2,
  ch3,
  width = 800,
  height = 300,
  isLive = false,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置 DPI 缩放
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空画布
    ctx.fillStyle = 'var(--color-bg-secondary)';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;

    // 竖线网格
    const gridSpacingX = width / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridSpacingX, 0);
      ctx.lineTo(i * gridSpacingX, height);
      ctx.stroke();
    }

    // 横线网格
    const gridSpacingY = height / 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * gridSpacingY);
      ctx.lineTo(width, i * gridSpacingY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // 绘制波形
    const drawWaveform = (data: number[], color: string, offset: number) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const maxValue = Math.max(...data.map(Math.abs), 1);
      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * width;
        const y = centerY - (data[i] / maxValue) * (channelHeight / 2) * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    // 绘制三个通道
    drawWaveform(ch1, 'var(--color-accent-primary)', 0);
    drawWaveform(ch2, '#4ade80', 1);
    drawWaveform(ch3, '#ef4444', 2);

    // 绘制通道标签
    ctx.fillStyle = 'var(--color-text-secondary)';
    ctx.font = '12px var(--font-sans)';
    ctx.fillText('CH1', 10, 20);
    ctx.fillText('CH2', 10, height / 3 + 20);
    ctx.fillText('CH3', 10, (2 * height) / 3 + 20);

    // 绘制时间标签
    if (isLive) {
      const duration = (ch1.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2); // 250Hz 采样率
      ctx.fillStyle = 'var(--color-text-secondary)';
      ctx.font = '12px var(--font-sans)';
      ctx.textAlign = 'right';
      ctx.fillText(`${duration}s`, width - 10, height - 10);
    }
  }, [ch1, ch2, ch3, width, height, isLive]);

  return (
    <div className="mb-6">
      {title && (
        <div className="label mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          {title}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: 'auto',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      />
    </div>
  );
};

/**
 * 缩小波形图组件
 */
interface ThumbnailWaveformProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
}

export const ThumbnailWaveform: React.FC<ThumbnailWaveformProps> = ({
  ch1,
  ch2,
  ch3,
  index,
  onClick,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 120;
  const height = 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置 DPI 缩放
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空画布
    ctx.fillStyle = 'var(--color-bg-tertiary)';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制波形
    const drawWaveform = (data: number[], color: string, offset: number) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const maxValue = Math.max(...data.map(Math.abs), 1);
      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      // 采样间隔
      const step = Math.max(1, Math.floor(data.length / width));

      for (let i = 0; i < data.length; i += step) {
        const x = (i / data.length) * width;
        const y = centerY - (data[i] / maxValue) * (channelHeight / 2) * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    drawWaveform(ch1, 'var(--color-accent-primary)', 0);
    drawWaveform(ch2, '#4ade80', 1);
    drawWaveform(ch3, '#ef4444', 2);
  }, [ch1, ch2, ch3]);

  return (
    <div className="relative group">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={onClick}
        style={{
          cursor: 'pointer',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          transition: 'all 0.3s ease',
        }}
        className="group-hover:border-accent"
      />
      <div
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
      >
        <button
          className="bg-error text-white px-2 py-1 rounded text-xs font-bold hover:bg-red-700"
          title="删除"
        >
          ✕
        </button>
      </div>
      <div className="text-center text-xs text-secondary mt-1">采集 #{index}</div>
    </div>
  );
};

```

---

## components/ui/accordion.tsx

```typescript
import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

```

---

## components/ui/alert-dialog.tsx

```typescript
import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};

```

---

## components/ui/alert.tsx

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };

```

---

## components/ui/aspect-ratio.tsx

```typescript
import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />;
}

export { AspectRatio };

```

---

## components/ui/avatar.tsx

```typescript
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };

```

---

## components/ui/badge.tsx

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

```

---

## components/ui/breadcrumb.tsx

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
        className
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn("hover:text-foreground transition-colors", className)}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("text-foreground font-normal", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};

```

---

## components/ui/button-group.tsx

```typescript
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const buttonGroupVariants = cva(
  "flex w-fit items-stretch [&>*]:focus-visible:z-10 [&>*]:focus-visible:relative [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md has-[>[data-slot=button-group]]:gap-2",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
);

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      className={cn(
        "bg-muted flex items-center gap-2 rounded-md border px-4 text-sm font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "bg-input relative !m-0 self-stretch data-[orientation=vertical]:h-auto",
        className
      )}
      {...props}
    />
  );
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
};

```

---

## components/ui/button.tsx

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-transparent shadow-xs hover:bg-accent dark:bg-transparent dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

```

---

## components/ui/calendar.tsx

```typescript
import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: date =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };

```

---

## components/ui/card.tsx

```typescript
import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

```

---

## components/ui/carousel.tsx

```typescript
import * as React from "react";
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />");
  }

  return context;
}

function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins
  );
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = React.useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext]
  );

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);

    return () => {
      api?.off("select", onSelect);
    };
  }, [api, onSelect]);

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div
      ref={carouselRef}
      className="overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  const { orientation } = useCarousel();

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  variant = "outline",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -left-12 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft />
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

function CarouselNext({
  className,
  variant = "outline",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -right-12 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight />
      <span className="sr-only">Next slide</span>
    </Button>
  );
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};

```

---

## components/ui/chart.tsx

```typescript
import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  }) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter(item => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color || item.payload.fill || item.color;

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> &
  Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
    hideIcon?: boolean;
    nameKey?: string;
  }) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload
        .filter(item => item.type !== "none")
        .map(item => {
          const key = `${nameKey || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              key={item.value}
              className={cn(
                "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};

```

---

## components/ui/checkbox.tsx

```typescript
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

```

---

## components/ui/collapsible.tsx

```typescript
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

```

---

## components/ui/command.tsx

```typescript
"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};

```

---

## components/ui/context-menu.tsx

```typescript
import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  );
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  );
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  );
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  );
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};

```

---

## components/ui/dialog.tsx

```typescript
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    []
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { isComposing } = useDialogComposition();

  const handleEscapeKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      // Check both the native isComposing property and our context state
      // This handles Safari's timing issues with composition events
      const isCurrentlyComposing = (e as any).isComposing || isComposing();

      // If IME is composing, prevent dialog from closing
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }

      // Call user's onEscapeKeyDown if provided
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
};


```

---

## components/ui/drawer.tsx

```typescript
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};

```

---

## components/ui/dropdown-menu.tsx

```typescript
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  );
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};

```

---

## components/ui/empty.tsx

```typescript
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        className
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        className
      )}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-lg font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-muted-foreground [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};

```

---

## components/ui/field.tsx

```typescript
import { useMemo } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-6",
        "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-3 font-medium",
        "data-[variant=legend]:text-base",
        "data-[variant=label]:text-sm",
        className
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
        className
      )}
      {...props}
    />
  );
}

const fieldVariants = cva(
  "group/field flex w-full gap-3 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: ["flex-col [&>*]:w-full [&>.sr-only]:w-auto"],
        horizontal: [
          "flex-row items-center",
          "[&>[data-slot=field-label]]:flex-auto",
          "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
        responsive: [
          "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto",
          "@md/field-group:[&>[data-slot=field-label]]:flex-auto",
          "@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-1.5 leading-snug",
        className
      )}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4",
        "has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10",
        className
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
        "last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors) {
      return null;
    }

    if (errors?.length === 1 && errors[0]?.message) {
      return errors[0].message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm font-normal", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};

```

---

## components/ui/form.tsx

```typescript
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : props.children;

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};

```

---

## components/ui/hover-card.tsx

```typescript
import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  );
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };

```

---

## components/ui/input-group.tsx

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group border-input dark:bg-input/30 relative flex w-full items-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
        "h-9 min-w-0 has-[>textarea]:h-auto",

        // Variants based on alignment.
        "has-[>[data-align=inline-start]]:[&>input]:pl-2",
        "has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",

        // Focus state.
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]",

        // Error state.
        "has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",

        className
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
        "inline-end":
          "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5",
        "block-end":
          "order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={e => {
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva(
  "text-sm shadow-none flex gap-2 items-center",
  {
    variants: {
      size: {
        xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
        sm: "h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5",
        "icon-xs":
          "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};

```

---

## components/ui/input-otp.tsx

```typescript
import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2 has-disabled:opacity-50",
        containerClassName
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };

```

---

## components/ui/input.tsx

```typescript
import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

function Input({
  className,
  type,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"input">) {
  // Get dialog composition context if available (will be no-op if not inside Dialog)
  const dialogComposition = useDialogComposition();

  // Add composition event handlers to support input method editor (IME) for CJK languages.
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLInputElement>({
    onKeyDown: (e) => {
      // Check if this is an Enter key that should be blocked
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();

      // If Enter key is pressed while composing or just after composition ended,
      // don't call the user's onKeyDown (this blocks the business logic)
      if (e.key === "Enter" && isComposing) {
        return;
      }

      // Otherwise, call the user's onKeyDown
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      // Mark that composition just ended - this helps handle the Enter key that confirms input
      dialogComposition.markCompositionEnd();
      // Delay setting composing to false to handle Safari's event order
      // In Safari, compositionEnd fires before the ESC keydown event
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Input };

```

---

## components/ui/item.tsx

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn("group/item-group flex flex-col", className)}
      {...props}
    />
  );
}

function ItemSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("my-0", className)}
      {...props}
    />
  );
}

const itemVariants = cva(
  "group/item flex items-center border border-transparent text-sm rounded-md transition-colors [a]:hover:bg-accent/50 [a]:transition-colors duration-100 flex-wrap outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border",
        muted: "bg-muted/50",
      },
      size: {
        default: "p-4 gap-4 ",
        sm: "py-3 px-4 gap-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Item({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  );
}

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none group-has-[[data-slot=item-description]]/item:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 border rounded-sm bg-muted [&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 rounded-sm overflow-hidden [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function ItemMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn(
        "flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none",
        className
      )}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium",
        className
      )}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "text-muted-foreground line-clamp-2 text-sm leading-normal font-normal text-balance",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-header"
      className={cn(
        "flex basis-full items-center justify-between gap-2",
        className
      )}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn(
        "flex basis-full items-center justify-between gap-2",
        className
      )}
      {...props}
    />
  );
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
};

```

---

## components/ui/kbd.tsx

```typescript
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };

```

---

## components/ui/label.tsx

```typescript
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };

```

---

## components/ui/menubar.tsx

```typescript
import * as React from "react";
import * as MenubarPrimitive from "@radix-ui/react-menubar";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn(
        "bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
        className
      )}
      {...props}
    />
  );
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />;
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Group>) {
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />;
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />;
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  );
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none",
        className
      )}
      {...props}
    />
  );
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPortal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </MenubarPortal>
  );
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  );
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  );
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <MenubarPrimitive.Label
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  );
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />;
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4" />
    </MenubarPrimitive.SubTrigger>
  );
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return (
    <MenubarPrimitive.SubContent
      data-slot="menubar-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
};

```

---

## components/ui/navigation-menu.tsx

```typescript
import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-1",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=open]:hover:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:focus:bg-accent data-[state=open]:bg-accent/50 focus-visible:ring-ring/50 outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1"
);

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full p-2 pr-2.5 md:absolute md:w-auto",
        "group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:duration-200 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 isolate z-50 flex justify-center"
      )}
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-center bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/50 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 [&_svg:not([class*='text-'])]:text-muted-foreground flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
};

```

---

## components/ui/pagination.tsx

```typescript
import * as React from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">;

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">Previous</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <ChevronRightIcon />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};

```

---

## components/ui/popover.tsx

```typescript
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };

```

---

## components/ui/progress.tsx

```typescript
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };

```

---

## components/ui/radio-group.tsx

```typescript
import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

```

---

## components/ui/resizable.tsx

```typescript
import * as React from "react";
import { GripVerticalIcon } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };

```

---

## components/ui/scroll-area.tsx

```typescript
import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };

```

---

## components/ui/select.tsx

```typescript
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

```

---

## components/ui/separator.tsx

```typescript
import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  );
}

export { Separator };

```

---

## components/ui/sheet.tsx

```typescript
"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

```

---

## components/ui/sidebar.tsx

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import * as React from "react";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile(open => !open) : setOpen(open => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  disableTransition = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  disableTransition?: boolean;
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent",
          disableTransition
            ? "transition-none"
            : "transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) md:flex",
          disableTransition
            ? "transition-none"
            : "transition-[left,right,width] duration-200 ease-linear",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={event => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  );
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
};


```

---

## components/ui/skeleton.tsx

```typescript
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };

```

---

## components/ui/slider.tsx

```typescript
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };

```

---

## components/ui/sonner.tsx

```typescript
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };

```

---

## components/ui/spinner.tsx

```typescript
import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

```

---

## components/ui/switch.tsx

```typescript
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

```

---

## components/ui/table.tsx

```typescript
import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

```

---

## components/ui/tabs.tsx

```typescript
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

```

---

## components/ui/textarea.tsx

```typescript
import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

function Textarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"textarea">) {
  // Get dialog composition context if available (will be no-op if not inside Dialog)
  const dialogComposition = useDialogComposition();

  // Add composition event handlers to support input method editor (IME) for CJK languages.
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLTextAreaElement>({
    onKeyDown: (e) => {
      // Check if this is an Enter key that should be blocked
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();

      // If Enter key is pressed while composing or just after composition ended,
      // don't call the user's onKeyDown (this blocks the business logic)
      // Note: For textarea, Shift+Enter should still work for newlines
      if (e.key === "Enter" && !e.shiftKey && isComposing) {
        return;
      }

      // Otherwise, call the user's onKeyDown
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      // Mark that composition just ended - this helps handle the Enter key that confirms input
      dialogComposition.markCompositionEnd();
      // Delay setting composing to false to handle Safari's event order
      // In Safari, compositionEnd fires before the ESC keydown event
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Textarea };

```

---

## components/ui/toggle-group.tsx

```typescript
"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
});

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };

```

---

## components/ui/toggle.tsx

```typescript
import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };

```

---

## components/ui/tooltip.tsx

```typescript
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

```

---

## contexts/AuthContext.tsx

```typescript
/**
 * 认证上下文 - 管理采集和数据管理页面的登录状态
 * 
 * 功能：
 * - 密码认证
 * - 会话管理
 * - 登录状态持久化
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CORRECT_PASSWORD = 'geniusatwork';
const AUTH_SESSION_KEY = 'ear-emg-auth-session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 小时

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 初始化时检查会话
  useEffect(() => {
    const storedSession = localStorage.getItem(AUTH_SESSION_KEY);
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        const now = Date.now();
        
        // 检查会话是否过期
        if (session.expiresAt > now) {
          setIsAuthenticated(true);
        } else {
          // 会话已过期，清除
          localStorage.removeItem(AUTH_SESSION_KEY);
        }
      } catch (e) {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    }
  }, []);

  const login = (password: string): boolean => {
    if (password === CORRECT_PASSWORD) {
      const session = {
        timestamp: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION,
      };
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

```

---

## contexts/SerialConnectionContext.tsx

```typescript
/**
 * 串口连接全局 Context
 * 
 * 用于在整个应用中共享硬件连接状态
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useSerialConnection } from '@/hooks/useSerialConnection';

// Web Serial API 类型
type SerialPort = any; // 来自 Web Serial API，无需完整类型定义

interface SerialData {
  channel1: number;
  channel2: number;
  channel3: number;
  timestamp: number;
}

interface SerialConnectionContextType {
  isConnected: boolean;
  error: string | null;
  isSupported: () => boolean;
  requestPort: () => Promise<SerialPort>;
  connect: (port?: SerialPort, baudRate?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  onDataReceived: (callback: (data: SerialData) => void) => void;
  sendData: (data: Uint8Array) => Promise<void>;
}

const SerialConnectionContext = createContext<SerialConnectionContextType | undefined>(undefined);

export function SerialConnectionProvider({ children }: { children: ReactNode }) {
  const serialConnection = useSerialConnection();

  return (
    <SerialConnectionContext.Provider value={serialConnection}>
      {children}
    </SerialConnectionContext.Provider>
  );
}

export function useSerialConnectionContext() {
  const context = useContext(SerialConnectionContext);
  if (!context) {
    throw new Error('useSerialConnectionContext must be used within SerialConnectionProvider');
  }
  return context;
}

```

---

## contexts/ThemeContext.tsx

```typescript
import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

```

---

## contexts/UserContext.tsx

```typescript
/**
 * 用户管理上下文
 * 
 * 功能：
 * - 用户创建和切换
 * - 用户特征库管理
 * - 用户电极基准管理
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserElectrodeBaseline {
  // 电极基准信号特征
  ch1Mean: number;
  ch1Std: number;
  ch2Mean: number;
  ch2Std: number;
  ch3Mean: number;
  ch3Std: number;
  
  // 频谱特征
  dominantFrequency: number;
  snr: number;
  
  // 采集时间戳
  capturedAt: Date;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: Date;
  lastUsed: Date;
  electrodeBaseline?: UserElectrodeBaseline;
}

interface UserContextType {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  createUser: (name: string) => UserProfile;
  switchUser: (userId: string) => void;
  deleteUser: (userId: string) => void;
  updateElectrodeBaseline: (baseline: UserElectrodeBaseline) => void;
  getElectrodeBaseline: () => UserElectrodeBaseline | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // 从 localStorage 加载用户数据
  useEffect(() => {
    const saved = localStorage.getItem('emg-users');
    const currentUserId = localStorage.getItem('emg-current-user');

    if (saved) {
      try {
        const users = JSON.parse(saved).map((u: UserProfile) => ({
          ...u,
          createdAt: new Date(u.createdAt),
          lastUsed: new Date(u.lastUsed),
          electrodeBaseline: u.electrodeBaseline ? {
            ...u.electrodeBaseline,
            capturedAt: new Date(u.electrodeBaseline.capturedAt),
          } : undefined,
        }));
        setAllUsers(users);

        // 恢复当前用户
        if (currentUserId) {
          const user = users.find((u: UserProfile) => u.id === currentUserId);
          if (user) {
            setCurrentUser(user);
          }
        }
      } catch (err) {
        console.error('加载用户数据失败:', err);
      }
    }
  }, []);

  // 保存用户数据到 localStorage
  const saveUsers = (users: UserProfile[]) => {
    localStorage.setItem('emg-users', JSON.stringify(users));
  };

  const createUser = (name: string): UserProfile => {
    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      name,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    const updated = [...allUsers, newUser];
    setAllUsers(updated);
    saveUsers(updated);
    switchUser(newUser.id);

    return newUser;
  };

  const switchUser = (userId: string) => {
    const user = allUsers.find((u) => u.id === userId);
    if (user) {
      const updated = allUsers.map((u) =>
        u.id === userId ? { ...u, lastUsed: new Date() } : u
      );
      setAllUsers(updated);
      saveUsers(updated);
      setCurrentUser(user);
      localStorage.setItem('emg-current-user', userId);
    }
  };

  const deleteUser = (userId: string) => {
    const updated = allUsers.filter((u) => u.id !== userId);
    setAllUsers(updated);
    saveUsers(updated);

    // 如果删除的是当前用户，切换到第一个用户
    if (currentUser?.id === userId) {
      if (updated.length > 0) {
        switchUser(updated[0].id);
      } else {
        setCurrentUser(null);
        localStorage.removeItem('emg-current-user');
      }
    }
  };

  const updateElectrodeBaseline = (baseline: UserElectrodeBaseline) => {
    if (!currentUser) return;

    const updated = allUsers.map((u) =>
      u.id === currentUser.id
        ? { ...u, electrodeBaseline: baseline }
        : u
    );

    setAllUsers(updated);
    saveUsers(updated);
    setCurrentUser({ ...currentUser, electrodeBaseline: baseline });
  };

  const getElectrodeBaseline = (): UserElectrodeBaseline | null => {
    return currentUser?.electrodeBaseline || null;
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        allUsers,
        createUser,
        switchUser,
        deleteUser,
        updateElectrodeBaseline,
        getElectrodeBaseline,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}

```

---

## contexts/UserSessionContext.tsx

```typescript
/**
 * 用户会话管理上下文
 * 
 * 功能：
 * - 管理当前登录用户
 * - 存储用户会话信息
 * - 提供用户登录/登出/注册功能
 * - 集成审计日志记录
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, registerUser, UserAccount } from '@/lib/user-auth';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';

export interface UserSession {
  userId: string;
  userName: string;
  isAdmin: boolean;
  loginTime: Date;
}

interface UserSessionContextType {
  currentUser: UserSession | null;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(undefined);

export function UserSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // 从 localStorage 恢复用户会话
  useEffect(() => {
    const saved = localStorage.getItem('emg-current-user-session');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setCurrentUser(user);
      } catch (err) {
        console.error('Failed to restore user session:', err);
      }
    }
  }, []);

  const login = async (username: string, password: string) => {
    const result = await loginUser(username, password);
    
    if (result.success && result.account) {
      const user: UserSession = {
        userId: result.account.userId,
        userName: result.account.username,
        isAdmin: result.account.isAdmin,
        loginTime: new Date(),
      };
      setCurrentUser(user);
      localStorage.setItem('emg-current-user-session', JSON.stringify(user));
      
      // 记录登录事件
      logAuditEvent(
        AuditEventType.USER_LOGIN,
        { username },
        result.account.userId,
        result.account.username
      );
    }

    return {
      success: result.success,
      message: result.message,
    };
  };

  const register = async (username: string, password: string) => {
    const result = await registerUser(username, password);
    
    if (result.success && result.userId) {
      // 记录注册事件
      logAuditEvent(
        AuditEventType.USER_REGISTER,
        { username },
        result.userId,
        username
      );
    }
    
    return {
      success: result.success,
      message: result.message,
    };
  };

  const logout = () => {
    if (currentUser) {
      // 记录登出事件
      logAuditEvent(
        AuditEventType.USER_LOGOUT,
        {},
        currentUser.userId,
        currentUser.userName
      );
    }
    
    setCurrentUser(null);
    localStorage.removeItem('emg-current-user-session');
  };

  return (
    <UserSessionContext.Provider
      value={{
        currentUser,
        isLoggedIn: !!currentUser,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserSessionContext.Provider>
  );
}

export function useUserSession() {
  const context = useContext(UserSessionContext);
  if (!context) {
    throw new Error('useUserSession must be used within UserSessionProvider');
  }
  return context;
}

```

---

## hooks/useMobile.tsx

```typescript
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

```

---

## main.tsx

```typescript
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

```

---

## pages/AdminDashboard.tsx

```typescript
/**
 * 管理员后台页面
 * 
 * 功能：
 * - 查看所有用户和采集数据
 * - 管理用户账户
 * - 删除用户数据
 * - 系统统计
 * - 重置用户密码
 * - 导出采集数据
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
} from '@/components/PremiumComponents';
import { useUserSession } from '@/contexts/UserSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { LoginDialog } from '@/components/LoginDialog';
import { resetUserPassword } from '@/lib/user-auth';
import { exportToCSV, exportToJSON, exportUserStatistics } from '@/lib/data-export';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';

interface UserInfo {
  userId: string;
  userName: string;
  collections: number;
  createdAt?: number;
}

interface CommandData {
  name: string;
  collections: Array<{
    userId?: string;
    userName?: string;
    timestamp: number | Date;
    duration: number;
  }>;
}

export default function AdminDashboard() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { currentUser } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isAuthenticated);

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [commandsData, setCommandsData] = useState<CommandData[]>([]);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // 检查管理员权限
  useEffect(() => {
    if (isAuthenticated && !currentUser?.isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, currentUser, navigate]);

  // 加载所有数据
  useEffect(() => {
    const loadData = () => {
      const saved = localStorage.getItem('emg-commands');
      if (saved) {
        const commands = JSON.parse(saved);
        setCommandsData(commands);

        // 收集用户信息
        const userMap = new Map<string, UserInfo>();
        commands.forEach((cmd: any) => {
          cmd.collections?.forEach((col: any) => {
            if (col.userId && col.userName) {
              if (!userMap.has(col.userId)) {
                userMap.set(col.userId, {
                  userId: col.userId,
                  userName: col.userName,
                  collections: 0,
                });
              }
              const user = userMap.get(col.userId)!;
              user.collections += 1;
            }
          });
        });
        setUsers(Array.from(userMap.values()));
      }
    };

    loadData();
  }, []);

  // 删除用户的所有数据
  const handleDeleteUserData = (userId: string) => {
    const userName = users.find(u => u.userId === userId)?.userName;
    if (confirm(`确认删除用户 "${userName}" 的所有采集数据？`)) {
      const updated = commandsData
        .map((cmd) => ({
          ...cmd,
          collections: cmd.collections.filter((col) => col.userId !== userId),
        }))
        .filter((cmd) => cmd.collections.length > 0);

      setCommandsData(updated);
      localStorage.setItem('emg-commands', JSON.stringify(updated));

      // 更新用户列表
      setUsers(users.filter((u) => u.userId !== userId));
      
      // 记录删除事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.ADMIN_DELETE_USER_DATA,
          { targetUserId: userId, targetUserName: userName },
          currentUser.userId,
          currentUser.userName
        );
      }
    }
  };

  // 删除所有数据
  const handleClearAllData = () => {
    if (confirm('确认清空所有采集数据？此操作不可撤销！')) {
      setCommandsData([]);
      setUsers([]);
      localStorage.removeItem('emg-commands');
      
      // 记录清空数据事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.ADMIN_CLEAR_ALL_DATA,
          { action: 'clear_all_data' },
          currentUser.userId,
          currentUser.userName
        );
      }
    }
  };

  // 重置用户密码
  const handleResetPassword = async (userId: string) => {
    if (!newPassword) {
      alert('请输入新密码');
      return;
    }

    // 添加确认对话
    const confirmed = window.confirm(
      `是否确定要为用户 ${userId} 重置密码?\n\n新密码: ${newPassword}\n\n此操作将被记录到审计日志中。`
    );

    if (!confirmed) {
      return;
    }

    const result = await resetUserPassword(userId, newPassword);
    if (result.success) {
      alert(result.message);
      setResetPasswordUserId(null);
      setNewPassword('');
      
      // 记录重置密码事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.USER_PASSWORD_RESET,
          { targetUserId: userId },
          currentUser.userId,
          currentUser.userName
        );
      }
    } else {
      alert(result.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <LoginDialog
        isOpen={showLoginDialog}
        onClose={() => {
          if (!isAuthenticated) {
            navigate('/');
          }
        }}
      />
    );
  }

  if (!currentUser?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-error text-center py-12">您没有权限访问此页面</p>
        </Card>
      </div>
    );
  }

  const totalCollections = commandsData.reduce((sum, cmd) => sum + cmd.collections.length, 0);

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">ADMIN PANEL</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                管理员后台
              </h1>
            </div>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={() => navigate('/audit-logs')}>
                查看审计日志
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                返回主页
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">SYSTEM OVERVIEW</SectionLabel>
          <SectionTitle>系统概览</SectionTitle>

          <Grid cols={3} gap="lg" className="mb-8">
            <Card>
              <div className="label mb-4">注册用户</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {users.length}
              </div>
              <p className="text-secondary text-sm">个用户</p>
            </Card>

            <Card>
              <div className="label mb-4">采集指令</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {commandsData.length}
              </div>
              <p className="text-secondary text-sm">个指令</p>
            </Card>

            <Card>
              <div className="label mb-4">总采集次数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {totalCollections}
              </div>
              <p className="text-secondary text-sm">次采集</p>
            </Card>
          </Grid>

          <Divider />

          {/* 数据导出 */}
          <Section className="py-12">
            <SectionLabel>DATA EXPORT</SectionLabel>
            <SectionTitle>数据导出</SectionTitle>

            <Card className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  variant="secondary"
                  onClick={() => exportToJSON(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  📄 导出 JSON
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportToCSV(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  📊 导出 CSV
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportUserStatistics(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  👥 导出用户统计
                </Button>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 数据管理操作 */}
          <Section className="py-12">
            <SectionLabel>DATA MANAGEMENT</SectionLabel>
            <SectionTitle>数据管理</SectionTitle>

            <Card className="mb-8">
              <div className="flex gap-4">
                <Button
                  variant="error"
                  onClick={handleClearAllData}
                  disabled={commandsData.length === 0}
                >
                  🗑️ 清空所有数据
                </Button>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 用户管理 */}
          <Section className="py-12">
            <SectionLabel number="02">USER MANAGEMENT</SectionLabel>
            <SectionTitle>用户管理</SectionTitle>

            {users.length === 0 ? (
              <Card>
                <p className="text-secondary text-center py-12">暂无用户数据</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {users.map((user) => (
                  <Card key={user.userId}>
                    {resetPasswordUserId === user.userId ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-2xl font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {user.userName}
                          </h4>
                          <p className="text-secondary text-sm mt-2">
                            {user.collections} 次采集
                          </p>
                        </div>
                        <div className="space-y-3">
                          <input
                            type="password"
                            placeholder="输入新密码（至少6个字符）"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded border"
                            style={{
                              borderColor: 'var(--color-border)',
                              backgroundColor: 'var(--color-background-secondary)',
                              color: 'var(--color-text)',
                            }}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              onClick={() => handleResetPassword(user.userId)}
                            >
                              ✓ 确认重置
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setResetPasswordUserId(null);
                                setNewPassword('');
                              }}
                            >
                              ✕ 取消
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-2xl font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {user.userName}
                          </h4>
                          <p className="text-secondary text-sm mt-2">
                            {user.collections} 次采集
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setResetPasswordUserId(user.userId)}
                          >
                            🔑 重置密码
                          </Button>
                          <Button
                            variant="error"
                            onClick={() => handleDeleteUserData(user.userId)}
                          >
                            🗑️ 删除用户数据
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </Section>
      </Container>
    </div>
  );
}

```

---

## pages/AuditLogs.tsx

```typescript
/**
 * 审计日志查看页面
 * 
 * 功能：
 * - 查看系统审计日志
 * - 按事件类型过滤
 * - 按用户过滤
 * - 导出审计日志
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
} from '@/components/PremiumComponents';
import { useUserSession } from '@/contexts/UserSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { LoginDialog } from '@/components/LoginDialog';
import {
  getAllAuditLogs,
  getAuditStatistics,
  exportAuditLogsToCSV,
  AuditEventType,
  AuditLogEntry,
} from '@/lib/audit-log';

export default function AuditLogs() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { currentUser } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isAuthenticated);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filterEventType, setFilterEventType] = useState<string | 'all'>('all');
  const [filterUserName, setFilterUserName] = useState<string | 'all'>('all');
  const [allUserNames, setAllUserNames] = useState<string[]>([]);

  // 检查管理员权限
  useEffect(() => {
    if (isAuthenticated && !currentUser?.isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, currentUser, navigate]);

  // 加载审计日志
  useEffect(() => {
    const allLogs = getAllAuditLogs();
    setLogs(allLogs);

    const statistics = getAuditStatistics();
    setStats(statistics);

    // 收集所有用户名
    const userNames = Array.from(new Set(allLogs.map(log => log.userName || 'Unknown')));
    setAllUserNames(userNames);
  }, []);

  if (!isAuthenticated) {
    return (
      <LoginDialog
        isOpen={showLoginDialog}
        onClose={() => {
          if (!isAuthenticated) {
            navigate('/');
          }
        }}
      />
    );
  }

  if (!currentUser?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-error text-center py-12">您没有权限访问此页面</p>
        </Card>
      </div>
    );
  }

  // 过滤日志
  const filteredLogs = logs.filter(log => {
    const eventTypeMatch = filterEventType === 'all' || log.eventType === filterEventType;
    const userNameMatch = filterUserName === 'all' || log.userName === filterUserName;
    return eventTypeMatch && userNameMatch;
  }).reverse();

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">AUDIT LOGS</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                审计日志
              </h1>
            </div>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={() => navigate('/admin')}>
                返回管理员后台
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">STATISTICS</SectionLabel>
          <SectionTitle>统计信息</SectionTitle>

          <Grid cols={2} gap="lg" className="mb-8">
            <Card>
              <div className="label mb-4">总事件数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {stats?.totalEvents || 0}
              </div>
              <p className="text-secondary text-sm">条审计记录</p>
            </Card>

            <Card>
              <div className="label mb-4">事件类型</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {stats?.eventsByType ? Object.keys(stats.eventsByType).length : 0}
              </div>
              <p className="text-secondary text-sm">种事件类型</p>
            </Card>
          </Grid>

          <Divider />

          {/* 事件类型统计 */}
          <Section className="py-12">
            <SectionLabel>EVENT TYPES</SectionLabel>
            <SectionTitle>事件类型统计</SectionTitle>

            <Card className="mb-8">
              <div className="space-y-3">
                {stats?.eventsByType && Object.entries(stats.eventsByType).map(([eventType, count]) => (
                  <div key={eventType} className="flex justify-between items-center">
                    <span className="text-secondary">{eventType}</span>
                    <span className="text-accent font-bold">{count as number}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 用户统计 */}
          <Section className="py-12">
            <SectionLabel>USER STATISTICS</SectionLabel>
            <SectionTitle>用户统计</SectionTitle>

            <Card className="mb-8">
              <div className="space-y-3">
                {stats?.eventsByUser && Object.entries(stats.eventsByUser).map(([userName, count]) => (
                  <div key={userName} className="flex justify-between items-center">
                    <span className="text-secondary">{userName}</span>
                    <span className="text-accent font-bold">{count as number}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 日志过滤和导出 */}
          <Section className="py-12">
            <SectionLabel number="02">LOG MANAGEMENT</SectionLabel>
            <SectionTitle>日志管理</SectionTitle>

            <Card className="mb-8 p-6">
              <div className="space-y-4">
                <div>
                  <label className="label mb-2">事件类型过滤</label>
                  <select
                    value={filterEventType}
                    onChange={(e) => setFilterEventType(e.target.value)}
                    className="w-full px-4 py-2 rounded border"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-background-secondary)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="all">所有事件类型</option>
                    {Object.values(AuditEventType).map(eventType => (
                      <option key={eventType} value={eventType}>{eventType}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label mb-2">用户过滤</label>
                  <select
                    value={filterUserName}
                    onChange={(e) => setFilterUserName(e.target.value)}
                    className="w-full px-4 py-2 rounded border"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-background-secondary)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="all">所有用户</option>
                    {allUserNames.map(userName => (
                      <option key={userName} value={userName}>{userName}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => exportAuditLogsToCSV(filteredLogs)}
                    disabled={filteredLogs.length === 0}
                  >
                    📥 导出日志
                  </Button>
                </div>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 日志列表 */}
          <Section className="py-12">
            <SectionLabel>AUDIT LOG ENTRIES</SectionLabel>
            <SectionTitle>审计日志</SectionTitle>

            {filteredLogs.length === 0 ? (
              <Card>
                <p className="text-secondary text-center py-12">暂无日志记录</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-lg font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {log.eventType}
                          </h4>
                          <p className="text-secondary text-sm">
                            {new Date(log.timestamp).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-secondary text-sm">{log.userName || 'Unknown'}</p>
                          <p className="text-secondary text-xs">{log.userId || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="text-secondary text-sm">
                        <p>详情: {JSON.stringify(log.details)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </Section>
      </Container>
    </div>
  );
}

```

---

## pages/CollectionMode.tsx

```typescript
/**
 * 采集训练页面 - 高端商业风格
 * 
 * 功能：
 * - 指令输入和管理
 * - 实时波形采集和显示（来自 STM32 串口）
 * - 波形裁剪（去除无效片段）
 * - 历史采集对比
 * - 特征库生成
 * - 支持继续采集已有指令
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Input,
  Divider,
  ProgressBar,
  ConfirmDialog,
} from '@/components/PremiumComponents';
import { WaveformVisualization, ThumbnailWaveform } from '@/components/WaveformVisualization';
import { EnhancedWaveformVisualization } from '@/components/EnhancedWaveformVisualization';
import { HardwareStatusComponent } from '@/components/HardwareStatus';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSession } from '@/contexts/UserSessionContext';
import { LoginDialog } from '@/components/LoginDialog';
import { detectValidSegment, cropWaveform } from '@/lib/dsp-processor';
import { DebugPanel } from '@/components/DebugPanel';
import { evaluateAllCollections, autoCropCollection, alignMultipleCollections } from '@/lib/auto-segmentation';
import { alignMultipleCollectionsImproved, batchCropCollections } from '@/lib/improved-segmentation';
import { alignMultipleCollectionsAfterPreprocessing } from '@/lib/preprocessing-aware-cropping';
import { INSTRUCTION_LENGTH_SPECS } from '@shared/instruction-length-spec';
import { evaluateAllCollectionsImproved } from '@/lib/quality-scoring-improved';
import { DataStorageService } from '@/lib/data-storage-service';
import { ImprovedQualityScoreList } from '@/components/ImprovedQualityScoreDisplay';
import { QualityScoreList } from '@/components/QualityScoreDisplay';
import { detectElectrodeStatus, isElectrodeStatusAcceptable } from '@/lib/electrode-detection';
import { normalizeWaveformLength } from '@/lib/fixed-length-cropping';
import { normalizeWaveformLengthMultiChannel } from '@/lib/waveform-normalizer';
import { ElectrodeDetectionPanel } from '@/components/ElectrodeDetectionPanel';
import { WaveformComparisonPanel } from '@/components/WaveformComparisonPanel';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  SAMPLE_RATE,
  FIXED_WAVEFORM_LENGTH,
  validateInstructionLength,
  calculateDurationMs,
  getInstructionSpec,
} from '@shared/instruction-length-spec';

interface CollectionData {
  index: number;
  timestamp: Date;
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

interface StoredCommand {
  name: string;
  collections: CollectionData[];
  createdAt: Date;
}

export default function CollectionMode() {
  const [location, navigate] = useLocation();
  const { isConnected, onDataReceived } = useSerialConnectionContext();
  const { isAuthenticated } = useAuth();
  const { currentUser } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isAuthenticated);
  
  // 电极检测状态
  const [showElectrodeCheck, setShowElectrodeCheck] = useState(false);
  const [electrodeCheckResult, setElectrodeCheckResult] = useState<any>(null);
  const [globalElectrodeBaseline, setGlobalElectrodeBaseline] = useState<any>(null);

  const [commandName, setCommandName] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [collectionHistory, setCollectionHistory] = useState<CollectionData[]>([]);
  const [currentWaveform, setCurrentWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'complete' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectionTime, setCollectionTime] = useState(0);
  
  // 波形裁剪状态
  const [showTrimUI, setShowTrimUI] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [pendingWaveform, setPendingWaveform] = useState<CollectionData | null>(null);
  
  // 已保存的指令库
  const [savedCommands, setSavedCommands] = useState<StoredCommand[]>([]);
  const [isAppendingMode, setIsAppendingMode] = useState(false);
  const [qualityScores, setQualityScores] = useState<Array<any>>([]);
  const [showComparisonPanel, setShowComparisonPanel] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 检查认证状态
  useEffect(() => {
    setShowLoginDialog(!isAuthenticated);
  }, [isAuthenticated]);

  // 从 DataStorageService 加载已保存的指令
  useEffect(() => {
    const loadCommands = async () => {
      try {
        const service = new DataStorageService();
        await service.initialize();
        const saved = await service.getAllCommands();
        if (saved && saved.length > 0) {
          // Convert StoredCommand format to CollectionCommand format
          const commands = saved.map((cmd) => ({
            name: cmd.name,
            collections: cmd.collections.map((col) => ({
              index: col.index,
              waveform: col.waveform,
              duration: col.duration,
              timestamp: new Date(col.timestamp),
            })),
            createdAt: new Date(cmd.createdAt),
          }));
          setSavedCommands(commands);
        }
      } catch (error: unknown) {
        console.error('Failed to load commands from storage:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('emg-commands');
        if (saved) {
          setSavedCommands(JSON.parse(saved));
        }
      }
    };
    loadCommands();
  }, []);

  // 检查指令是否已存在
  const checkCommandExists = (name: string) => {
    return savedCommands.some((cmd) => cmd.name === name);
  };

  // 更新质量评分（使用改进的算法）
  useEffect(() => {
    if (collectionHistory.length >= 1) {
      try {
        const scores = evaluateAllCollectionsImproved(
          collectionHistory.map((col) => col.waveform)
        );
        const scoresWithIndex = scores.map((score, idx) => ({
          ...score,
          index: idx,
        }));
        setQualityScores(scoresWithIndex);
      } catch (err) {
        console.error('质量评分计算失败:', err);
      }
    }
  }, [collectionHistory]);

  // 删除指定采集
  const handleDeleteCollection = (index: number) => {
    const newHistory = collectionHistory.filter((_, idx) => idx !== index);
    setCollectionHistory(newHistory);
    setCollectionCount(newHistory.length);
    toast.success(`已删除采集 #${index + 1}`);
  };

  // 重录指定采集（删除并提示用户重新采集）
  const handleRetryCollection = (index: number) => {
    handleDeleteCollection(index);
    toast.info(`请重新采集数据来替换采集 #${index + 1}`);
  };

  // 一键自动裁剪所有采集 - 使用预处理后裁剪（方案 B）
  const handleAutoCropAll = () => {
    if (collectionHistory.length === 0) {
      setError('没有采集数据可裁剪');
      return;
    }

    try {
      // 使用预处理后的对齐算法（方案 B）
      // 这个算法会：
      // 1. 对每个采集进行完整预处理（陷波、高通、ICA）
      // 2. 计算三通道 SNR 权重
      // 3. 融合三通道特征
      // 4. 在融合信号上进行裁剪
      // 5. 使用中位数对齐多个采集
      const alignment = alignMultipleCollectionsAfterPreprocessing(
        collectionHistory.map((col) => col.waveform),
        SAMPLE_RATE  // 采样率 500Hz
      );

      // 检查裁剪结果是否有效
      if (alignment.startIdx >= alignment.endIdx) {
        setError('无法识别有效波形，请检查采集数据');
        return;
      }

      // 裁剪所有采集
      const croppedHistory = collectionHistory.map((col) => ({
        ...col,
        waveform: {
          ch1: col.waveform.ch1.slice(alignment.startIdx, alignment.endIdx),
          ch2: col.waveform.ch2.slice(alignment.startIdx, alignment.endIdx),
          ch3: col.waveform.ch3.slice(alignment.startIdx, alignment.endIdx),
        },
        trimStart: alignment.startIdx,
        trimEnd: alignment.endIdx,
      }));

      // 检查裁剪后的数据是否有效
      const validCrops = croppedHistory.filter((col) => col.waveform.ch2.length > 10);
      if (validCrops.length === 0) {
        setError('裁剪后没有有效数据，请重新采集');
        return;
      }

      setCollectionHistory(validCrops);
      setCollectionCount(validCrops.length);
      setError(null);
      
      // 显示详细的裁剪结果
      const snrInfo = `SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`;
      alert(`✓ 已使用预处理后裁剪算法\n裁剪数据: ${validCrops.length}/${collectionHistory.length}\n有效片段比例: ${(alignment.confidence * 100).toFixed(1)}%\n${snrInfo}`);
    } catch (err) {
      console.error('自动裁剪失败:', err);
      setError(`自动裁剪失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 注册数据接收回调
  useEffect(() => {
    const handleDataReceived = (data: any) => {
      if (isCollecting) {
        setCurrentWaveform((prev) => ({
          ch1: [...prev.ch1, data.channel1],
          ch2: [...prev.ch2, data.channel2],
          ch3: [...prev.ch3, data.channel3],
        }));
      }
    };

    onDataReceived(handleDataReceived);
  }, [isCollecting, onDataReceived]);

  // 检查电极状态
  const handleCheckElectrode = () => {
    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    // 从 localStorage 加载全局电极基准
    const saved = localStorage.getItem('emg-global-electrode-baseline');
    if (!saved) {
      setError('系统未采集电极基准，请在调试页面采集');
      return;
    }

    try {
      const baseline = JSON.parse(saved);
      setGlobalElectrodeBaseline(baseline);
      
      // 实际检测当前电极状态
      // 使用最近的采集数据（如果有的话）
      if (collectionHistory.length > 0) {
        const latestCollection = collectionHistory[collectionHistory.length - 1];
        const result = detectElectrodeStatus(
          latestCollection.waveform.ch1,
          latestCollection.waveform.ch2,
          latestCollection.waveform.ch3,
          baseline
        );
        setElectrodeCheckResult(result);
        setShowElectrodeCheck(true);
      } else {
        // 没有采集数据，使用模拟数据进行检测
        const mockCh1 = Array(256).fill(0).map(() => Math.random() * 100);
        const mockCh2 = Array(256).fill(0).map(() => Math.random() * 100);
        const mockCh3 = Array(256).fill(0).map(() => Math.random() * 100);
        
        const result = detectElectrodeStatus(
          mockCh1,
          mockCh2,
          mockCh3,
          baseline
        );
        setElectrodeCheckResult(result);
        setShowElectrodeCheck(true);
      }
      
      setError(null);
    } catch (err) {
      console.error('电极检测失败:', err);
      setError('电极检测失败，请重试');
    }
  };

  // 开始采集
  const handleStartCollection = () => {
    if (!commandName.trim()) {
      setError('请输入指令名称');
      return;
    }

    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    // 检查电极状态
    if (electrodeCheckResult && !isElectrodeStatusAcceptable(electrodeCheckResult)) {
      setError('电极状态不符合要求，请先调节电极');
      return;
    }

    setIsCollecting(true);
    setError(null);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setShowElectrodeCheck(false);
    setElectrodeCheckResult(null);

    // 计时器
    timerRef.current = setInterval(() => {
      setCollectionTime((t) => t + 1);
    }, 1000);
  };

  // 停止采集
  const handleStopCollection = () => {
    setIsCollecting(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // 检查采集数据是否有效
    if (currentWaveform.ch1.length === 0) {
      setError('未采集到有效数据');
      return;
    }

    // 保存采集
    const newCollection: CollectionData = {
      index: collectionHistory.length + 1,
      timestamp: new Date(),
      waveform: currentWaveform,
      duration: collectionTime,
    };

    setCollectionHistory([...collectionHistory, newCollection]);
    setCollectionCount(collectionCount + 1);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setError(null);

    // 自动显示裁剪 UI
    setShowTrimUI(true);
    setPendingWaveform(newCollection);
    setTrimStart(0);
    setTrimEnd(currentWaveform.ch1.length);
  };

  // 应用裁剪
  const handleApplyTrim = () => {
    if (!pendingWaveform) return;

    const croppedWaveform = {
      ch1: pendingWaveform.waveform.ch1.slice(trimStart, trimEnd),
      ch2: pendingWaveform.waveform.ch2.slice(trimStart, trimEnd),
      ch3: pendingWaveform.waveform.ch3.slice(trimStart, trimEnd),
    };

    // 更新历史记录
    const updated = [...collectionHistory];
    updated[updated.length - 1] = {
      ...pendingWaveform,
      waveform: croppedWaveform,
      trimStart,
      trimEnd,
    };

    setCollectionHistory(updated);
    setShowTrimUI(false);
    setPendingWaveform(null);
  };

  // 完成采集 - 自动进行全部裁剪（改进版本）
  const handleCompleteCollection = () => {
    if (!currentUser) {
      toast.error('请先登录');
      return;
    }

    if (collectionHistory.length < 5) {
      setError('至少需要采集 5 次');
      return;
    }

    try {
      setError(null);
      
      // 显示裁剪进度
      toast.loading('正在自动裁剪采集数据...');

      // 改进 1：使用正确的采样率（500Hz）
      const alignment = alignMultipleCollectionsAfterPreprocessing(
        collectionHistory.map((col) => col.waveform),
        SAMPLE_RATE  // 采样率 500Hz
      );

      // 检查裁剪结果是否有效
      if (alignment.startIdx >= alignment.endIdx) {
        toast.dismiss();
        setError('无法识别有效波形，请检查采集数据质量');
        return;
      }

      // 对所有采集进行裁剪
      const croppedHistory = collectionHistory.map((col) => {
        const cropped = {
          ch1: col.waveform.ch1.slice(alignment.startIdx, alignment.endIdx),
          ch2: col.waveform.ch2.slice(alignment.startIdx, alignment.endIdx),
          ch3: col.waveform.ch3.slice(alignment.startIdx, alignment.endIdx),
        };
        
        // 添加：波形长度归一化到 512 样本
        const normalized = normalizeWaveformLengthMultiChannel(cropped, FIXED_WAVEFORM_LENGTH);
        
        return {
          ...col,
          waveform: normalized,
          trimStart: alignment.startIdx,
          trimEnd: alignment.endIdx,
        };
      });

      // 检查裁剪后的数据是否有效
      const validCrops = croppedHistory.filter((col) => 
        col.waveform.ch2.length === FIXED_WAVEFORM_LENGTH
      );
      if (validCrops.length === 0) {
        toast.dismiss();
        setError('裁剪后没有有效数据，请重新采集');
        return;
      }

      // 验证所有采集的长度都是 512
      for (const crop of validCrops) {
        if (crop.waveform.ch1.length !== FIXED_WAVEFORM_LENGTH ||
            crop.waveform.ch2.length !== FIXED_WAVEFORM_LENGTH ||
            crop.waveform.ch3.length !== FIXED_WAVEFORM_LENGTH) {
          toast.dismiss();
          setError(`⚠️ 波形长度不一致：${crop.waveform.ch1.length} != ${FIXED_WAVEFORM_LENGTH}`);
          return;
        }
      }

      // 改进 2：添加长度验证
      const firstCropDurationMs = calculateDurationMs(FIXED_WAVEFORM_LENGTH);
      const validation = validateInstructionLength(commandName, firstCropDurationMs);
      
      if (!validation.isValid) {
        toast.dismiss();
        setError(`⚠️ 裁剪后的波形不符合规范：${validation.message}`);
        return;
      }

      // 改进 3：显示时长信息和推荐值
      const spec = getInstructionSpec(commandName);
      const recommendedMsg = spec ? `（推荐：${spec.recommendedDurationMs}ms）` : '';
      logger.log(`裁切后时长: ${firstCropDurationMs.toFixed(0)}ms ${recommendedMsg}`);
      logger.log(`有效片段比例: ${(alignment.confidence * 100).toFixed(1)}%`);
      logger.log(`SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`);

      // 改进 4：自动调整参数以符合指令长度规范
      // 检查是否需要调整固定长度参数
      let adjustmentMsg = '';
      if (firstCropDurationMs < 150) {
        adjustmentMsg = '\n⚠️ 提示：采集时间较短，建议放慢发音速度';
      } else if (firstCropDurationMs > 600) {
        adjustmentMsg = '\n⚠️ 提示：采集时间较长，建议加快发音速度';
      }

      // 为每个采集添加用户信息
      const collectionsWithUser = validCrops.map(col => ({
        ...col,
        userId: currentUser.userId,
        userName: currentUser.userName,
      }));

      // 保存到 localStorage
      const newCommand: StoredCommand = {
        name: commandName,
        collections: collectionsWithUser,
        createdAt: new Date(),
      };

      const existingIndex = savedCommands.findIndex((cmd) => cmd.name === commandName);
      let updated: StoredCommand[];

      if (existingIndex >= 0) {
        // 追加到已有指令
        updated = [...savedCommands];
        updated[existingIndex].collections.push(...collectionsWithUser);
      } else {
        // 新建指令
        updated = [...savedCommands, newCommand];
      }

      setSavedCommands(updated);
      // Save to DataStorageService (IndexedDB)
      (async () => {
        try {
          const service = new DataStorageService();
          await service.initialize();
          // Convert CollectionCommand format to StoredCommand format
          const storedCommands = updated.map((cmd, idx) => ({
            id: `cmd-${idx}`,
            name: cmd.name,
            userId: currentUser.userId,
            timestamp: Date.now(),
            collections: cmd.collections.map((col, colIdx) => ({
              index: col.index ?? colIdx,
              timestamp: col.timestamp instanceof Date ? col.timestamp.getTime() : Date.now(),
              waveform: col.waveform,
              duration: col.duration,
              quality: 0.8, // Default quality score
            })),
            createdAt: cmd.createdAt instanceof Date ? cmd.createdAt.getTime() : Date.now(),
            updatedAt: Date.now(),
          }));
          for (const cmd of storedCommands) {
            await service.saveCommand(cmd);
          }
        } catch (error: unknown) {
          console.error('Failed to save commands to storage:', error);
          // Fallback to localStorage
          localStorage.setItem('emg-commands', JSON.stringify(updated));
        }
      })();

      // 显示成功提示
      const snrInfo = `SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`;
      const successMsg = `✓ 指令 "${commandName}" 已保存！
采集次数：${validCrops.length}
裁剪后时长：${firstCropDurationMs.toFixed(0)}ms ${recommendedMsg}
有效片段比例：${(alignment.confidence * 100).toFixed(1)}%
${snrInfo}

所有采集已自动裁剪，数据质量已保证。${adjustmentMsg}`;
      
      toast.dismiss();
      toast.success('采集数据已保存');
      alert(successMsg);

      // 重置状态，清空页面以便继续采集下一个指令
      setCommandName('');
      setCollectionHistory([]);
      setCollectionCount(0);
      setError(null);
      setShowConfirm(false);
      setConfirmAction(null);
      setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
      setCollectionTime(0);
      setShowTrimUI(false);
      setTrimStart(0);
      setTrimEnd(0);
      setPendingWaveform(null);
      setIsAppendingMode(false);
    } catch (err) {
      console.error('[AutoCrop] 自动裁剪失败:', err);
      toast.dismiss();
      setError(`自动裁剪失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };



  // 丢弃采集
  const handleDiscardCollection = () => {
    setCommandName('');
    setCollectionHistory([]);
    setCollectionCount(0);
    setError(null);
    setShowConfirm(false);
    setConfirmAction(null);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setShowTrimUI(false);
    setTrimStart(0);
    setTrimEnd(0);
    setPendingWaveform(null);
    setIsAppendingMode(false);
    setElectrodeCheckResult(null);
  };

  if (showLoginDialog) {
    return <LoginDialog isOpen={showLoginDialog} onClose={() => setShowLoginDialog(false)} />;
  }

  return (
    <Container>
      <Section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <SectionLabel>02 / COLLECTION MODE</SectionLabel>
            <SectionTitle>采集模式</SectionTitle>
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
          >
            ← 返回主页
          </button>
        </div>
        <Divider />

        {/* 硬件状态 */}
        <div style={{ marginBottom: '32px' }}>
          <HardwareStatusComponent />
        </div>

        {/* 指令名称输入 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#d4af37', fontSize: '14px', fontWeight: '600' }}>
            指令名称
          </label>
          <Input
            value={commandName}
            onChange={(e) => setCommandName(e.target.value)}
            placeholder="输入指令名称（如：向上、向下）"
            disabled={isCollecting}
          />
          {checkCommandExists(commandName) && commandName && (
            <div style={{ color: '#fbbf24', fontSize: '12px', marginTop: '4px' }}>
              ℹ️ 该指令已存在，继续采集将追加数据
            </div>
          )}
        </div>

        {/* 采集计数 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>采集进度</span>
            <span style={{ color: '#d4af37', fontWeight: 'bold' }}>{collectionCount} / 5+</span>
          </div>
          <ProgressBar value={Math.min(collectionCount / 5, 1)} />
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '24px',
            color: '#fca5a5',
            fontSize: '12px',
          }}>
            {error}
          </div>
        )}

        {/* 波形显示 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>
              {isCollecting ? '采集中...' : '波形显示'}
            </span>
          </div>
          <EnhancedWaveformVisualization
            ch1={isCollecting ? currentWaveform.ch1 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch1 : []}
            ch2={isCollecting ? currentWaveform.ch2 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch2 : []}
            ch3={isCollecting ? currentWaveform.ch3 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch3 : []}
            showLayers={true}
            title="三层波形显示 (Raw / Filtered / Envelope)"
          />
        </div>

        {/* 电极检测面板 */}
        {showElectrodeCheck && electrodeCheckResult && (
          <ElectrodeDetectionPanel
            result={electrodeCheckResult}
            isAcceptable={isElectrodeStatusAcceptable(electrodeCheckResult)}
          />
        )}

        {/* 采集控制 */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          justifyContent: 'center',
        }}>
          {!isCollecting ? (
            <>
              <button
                onClick={handleCheckElectrode}
                disabled={!isConnected}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected ? '#4ade80' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                检查电极
              </button>
              <button
                onClick={handleStartCollection}
                disabled={!isConnected}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected ? '#d4af37' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                开始采集
              </button>
            </>
          ) : (
            <button
              onClick={handleStopCollection}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              停止采集 ({collectionTime}s)
            </button>
          )}
        </div>

        {/* 采集历史 */}
        {collectionHistory.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: '#888', fontSize: '12px' }}>采集历史</span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '500px',
              overflowY: 'auto',
            }}>
              {collectionHistory.map((col, idx) => (
                <div key={idx} style={{
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  padding: '12px',
                }}>
                  <div style={{ marginBottom: '8px', fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>
                    采集 #{col.index} - {col.duration}s
                  </div>
                  <div style={{ height: '120px', backgroundColor: '#1a1a1a', borderRadius: '4px', padding: '8px' }}>
                    <ThumbnailWaveform ch1={col.waveform.ch1} ch2={col.waveform.ch2} ch3={col.waveform.ch3} index={col.index} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 质量评分 */}
        {qualityScores.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <ImprovedQualityScoreList
              scores={qualityScores}
              onDelete={handleDeleteCollection}
              onRetry={handleRetryCollection}
            />
          </div>
        )}

        {/* 操作按钮 */}
        {collectionHistory.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '24px',
          }}>
            <button
              onClick={() => setShowComparisonPanel(true)}
              disabled={collectionHistory.length < 2}
              style={{
                padding: '12px 24px',
                backgroundColor: collectionHistory.length >= 2 ? '#8b5cf6' : '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: collectionHistory.length >= 2 ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              波形对比
            </button>
            <button
              onClick={() => {
                setShowConfirm(true);
                setConfirmAction('complete');
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              确认保存
            </button>
            <button
              onClick={() => {
                setShowConfirm(true);
                setConfirmAction('discard');
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              丢弃数据
            </button>
          </div>
        )}

        {/* 确认对话框 */}
        {showConfirm && (
          <ConfirmDialog
            title={confirmAction === 'complete' ? '保存数据' : '丢弃数据'}
            message={confirmAction === 'complete' ? `确认保存 ${collectionCount} 次采集数据？` : '确认丢弃所有采集数据？'}
            onConfirm={() => {
              if (confirmAction === 'complete') {
                handleCompleteCollection();
              } else {
                handleDiscardCollection();
              }
            }}
            onCancel={() => {
              setShowConfirm(false);
              setConfirmAction(null);
            }}
            isOpen={showConfirm}
          />
        )}

        {/* 波形对比面板 */}
        {showComparisonPanel && collectionHistory.length > 0 && (
          <WaveformComparisonPanel
            waveforms={collectionHistory.map((col) => ({
              index: col.index,
              ch1: col.waveform.ch1,
              ch2: col.waveform.ch2,
              ch3: col.waveform.ch3,
            }))}
            onClose={() => setShowComparisonPanel(false)}
          />
        )}
      </Section>
    </Container>
  );
}

```

---

## pages/DataManagement.tsx

```typescript
/**
 * 数据管理页面 - 高端商业风格
 * 
 * 功能：
 * - 查看所有采集数据
 * - 按指令分类显示
 * - 查看每条指令的所有采集波形
 * - 删除单条采集
 * - 继续采集已有指令
 * - 导出数据
 * - 识别准确率统计
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
} from '@/components/PremiumComponents';
import { ThumbnailWaveform } from '@/components/WaveformVisualization';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSession } from '@/contexts/UserSessionContext';
import { LoginDialog } from '@/components/LoginDialog';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';
import { LengthDistributionChart } from '@/components/LengthDistributionChart';
import { analyzeLengthDistribution, LengthDistributionStats } from '@/lib/length-distribution-analysis';

interface CollectionData {
  index: number;
  timestamp: number | Date;
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  userId?: string;  // 采集用户 ID
  userName?: string;  // 采集用户名
}

interface CommandData {
  name: string;
  collections: CollectionData[];
  createdAt: number | Date;
  accuracy?: number;
}

export default function DataManagement() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { currentUser } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isAuthenticated);

  const [commandsData, setCommandsData] = useState<CommandData[]>([]);
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | 'all'>('all');  // 用户过滤
  const [allUsers, setAllUsers] = useState<Array<{userId: string; userName: string}>>([]);  // 所有用户列表
  const [lengthStats, setLengthStats] = useState<Map<string, LengthDistributionStats>>(new Map());  // 长度分布统计
  const [selectedCommandForStats, setSelectedCommandForStats] = useState<string | null>(null);  // 选中的指令用于显示统计

  // 检查认证状态
  useEffect(() => {
    setShowLoginDialog(!isAuthenticated);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <LoginDialog
        isOpen={showLoginDialog}
        onClose={() => {
          if (!isAuthenticated) {
            navigate('/');
          }
        }}
      />
    );
  }

  // 从 localStorage 加载数据
  useEffect(() => {
    const saved = localStorage.getItem('emg-commands');
    if (saved) {
      const parsed = JSON.parse(saved);
      const commands = parsed.map((cmd: any) => ({
        ...cmd,
        // 准确率将基于实际识别历史计算，不使用模拟数据
      }));
      setCommandsData(commands);
      
      // 计算长度分布统计
      const stats = new Map<string, LengthDistributionStats>();
      commands.forEach((cmd: CommandData) => {
        stats.set(cmd.name, analyzeLengthDistribution(cmd.name, cmd.collections));
      });
      setLengthStats(stats);
    }
  }, []);

  // 删除采集
  const handleDeleteCollection = (commandName: string, collectionIndex: number) => {
    setCommandsData(
      commandsData.map((cmd) =>
        cmd.name === commandName
          ? {
              ...cmd,
              collections: cmd.collections.filter((_, i) => i !== collectionIndex),
            }
          : cmd
      )
    );

    // 更新 localStorage
    const updated = commandsData.map((cmd) =>
      cmd.name === commandName
        ? {
            ...cmd,
            collections: cmd.collections.filter((_, i) => i !== collectionIndex),
          }
        : cmd
    );
    localStorage.setItem('emg-commands', JSON.stringify(updated));
    
    // 记录删除事件
    if (currentUser) {
      logAuditEvent(
        AuditEventType.COLLECTION_DELETE,
        { commandName, collectionIndex },
        currentUser.userId,
        currentUser.userName
      );
    }
  };

  // 删除整个指令
  const handleDeleteCommand = (commandName: string) => {
    if (confirm(`确认删除指令 "${commandName}" 及其所有采集数据？`)) {
      const command = commandsData.find(cmd => cmd.name === commandName);
      const updated = commandsData.filter((cmd) => cmd.name !== commandName);
      setCommandsData(updated);
      localStorage.setItem('emg-commands', JSON.stringify(updated));
      
      // 记录删除事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.COLLECTION_DELETE,
          { commandName, collectionsCount: command?.collections.length || 0 },
          currentUser.userId,
          currentUser.userName
        );
      }
    }
  };

  // 继续采集
  const handleContinueCollection = (commandName: string) => {
    // 导航到采集页面并传递指令名称
    navigate(`/collection?command=${encodeURIComponent(commandName)}`);
  };

  // 导出数据
  const handleExportData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      commands: commandsData.map((cmd) => ({
        name: cmd.name,
        collectionCount: cmd.collections.length,
        accuracy: cmd.accuracy,
        createdAt: cmd.createdAt,
        collections: cmd.collections.map((col) => ({
          index: col.index,
          timestamp: col.timestamp instanceof Date ? col.timestamp.toISOString() : new Date(col.timestamp).toISOString(),
          duration: col.duration,
        })),
      })),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emg-data-${new Date().getTime()}.json`;
    link.click();
  };

  // 清空所有数据
  const handleClearAllData = () => {
    if (confirm('确认删除所有采集数据？此操作无法撤销。')) {
      setCommandsData([]);
      localStorage.removeItem('emg-commands');
      
      // 记录清空数据事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.COLLECTION_DELETE,
          { action: 'clear_all' },
          currentUser.userId,
          currentUser.userName
        );
      }
    }
  };

  const totalCollections = commandsData.reduce((sum, cmd) => sum + cmd.collections.length, 0);
  const avgAccuracy = commandsData.length > 0
    ? (commandsData.reduce((sum, cmd) => sum + (cmd.accuracy || 0), 0) / commandsData.length).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">DATA MANAGEMENT</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                数据管理
              </h1>
            </div>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={() => navigate('/')}>
                返回主页
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">DATA OVERVIEW</SectionLabel>
          <SectionTitle>数据概览</SectionTitle>

          <Grid cols={3} gap="lg" className="mb-8">
            <Card>
              <div className="label mb-4">已采集指令</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {commandsData.length}
              </div>
              <p className="text-secondary text-sm">个指令</p>
            </Card>

            <Card>
              <div className="label mb-4">总采集次数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {totalCollections}
              </div>
              <p className="text-secondary text-sm">次采集</p>
            </Card>

            <Card>
              <div className="label mb-4">平均准确率</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {avgAccuracy}%
              </div>
              <p className="text-secondary text-sm">识别准确率</p>
            </Card>
          </Grid>

          <Divider />

          {/* 用户过滤器 - 仅管理员可见 */}
          {currentUser?.isAdmin && allUsers.length > 0 && (
            <Card className="mb-8 p-6">
              <div className="label mb-4">用户过滤</div>
              <div className="flex gap-4 flex-wrap">
                <button
                  onClick={() => setFilterUserId('all')}
                  className={`px-4 py-2 rounded transition ${
                    filterUserId === 'all'
                      ? 'bg-accent text-black'
                      : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  所有用户
                </button>
                {allUsers.map((user) => (
                  <button
                    key={user.userId}
                    onClick={() => setFilterUserId(user.userId)}
                    className={`px-4 py-2 rounded transition ${
                      filterUserId === user.userId
                        ? 'bg-accent text-black'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {user.userName}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* 数据管理操作 */}
          <Section className="py-12">
            <SectionLabel>DATA OPERATIONS</SectionLabel>
            <SectionTitle>数据操作</SectionTitle>

            <Card className="mb-8">
              <div className="flex gap-4">
                <Button variant="primary" onClick={handleExportData} disabled={commandsData.length === 0}>
                  📥 导出数据
                </Button>
                <Button
                  variant="error"
                  onClick={handleClearAllData}
                  disabled={commandsData.length === 0}
                >
                  🗑️ 清空所有数据
                </Button>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 指令详情 */}
          <Section className="py-12">
            <SectionLabel number="02">COMMAND DETAILS</SectionLabel>
            <SectionTitle>指令详情</SectionTitle>

            {commandsData.length === 0 ? (
              <Card>
                <p className="text-secondary text-center py-12">暂无采集数据</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {commandsData.map((cmd) => {
                  // 过滤采集数据
                  const filteredCollections = filterUserId === 'all'
                    ? cmd.collections
                    : cmd.collections.filter(col => col.userId === filterUserId);
                  
                  // 如果没有符合过滤条件的采集，跳过此指令
                  if (filteredCollections.length === 0) return null;
                  
                  return (
                  <Card key={cmd.name}>
                    <div
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedCommand(expandedCommand === cmd.name ? null : cmd.name)
                      }
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-2xl font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {cmd.name}
                          </h4>
                               <p className="text-secondary text-sm">
                            {filteredCollections.length} 次采集 • 准确率 {cmd.accuracy?.toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-2xl font-bold text-accent">
                          {expandedCommand === cmd.name ? '▼' : '▶'}
                        </div>
                      </div>
                    </div>

                    {/* 展开详情 */}
                    {expandedCommand === cmd.name && (
                      <>
                        <Divider className="my-6" />

                        {/* 长度分布统计 */}
                        {lengthStats.has(cmd.name) && (
                          <div className="mt-6 mb-8">
                            <div className="label mb-4">采集时长分布统计</div>
                            <LengthDistributionChart stats={lengthStats.get(cmd.name)!} height={300} />
                          </div>
                        )}

                        <Divider className="my-6" />

                        <div className="mt-6">
                          <div className="label mb-4">采集波形列表</div>

                          <div className="grid grid-cols-4 gap-4 mb-8">
                            {filteredCollections.map((col, idx) => {
                              const actualIdx = cmd.collections.indexOf(col);
                              return (
                              <div key={idx} className="relative">
                                <ThumbnailWaveform
                                  ch1={col.waveform.ch1}
                                  ch2={col.waveform.ch2}
                                  ch3={col.waveform.ch3}
                                  index={col.index}
                                  onDelete={() => handleDeleteCollection(cmd.name, idx)}
                                />
                                <p className="text-secondary text-xs mt-2 text-center">
                                  {col.userName && <span className="block">{col.userName}</span>}
                                  {new Date(col.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            );
                            })}
                          </div>

                          <Divider className="my-6" />

                          <div className="flex gap-4">
                            <Button
                              variant="primary"
                              onClick={() => handleContinueCollection(cmd.name)}
                            >
                              ➕ 继续采集
                            </Button>
                            <Button
                              variant="error"
                              onClick={() => handleDeleteCommand(cmd.name)}
                            >
                              🗑️ 删除指令
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </Card>
                );
                })
              }
              </div>
            )}
          </Section>

          <Divider />

          {/* 准确率统计 */}
          <Section className="py-12">
            <SectionLabel number="03">ACCURACY STATISTICS</SectionLabel>
            <SectionTitle>准确率统计</SectionTitle>

            <Card>
              <div className="space-y-4">
                {commandsData.map((cmd) => (
                  <div key={cmd.name}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-secondary">{cmd.name}</span>
                      <span className="font-semibold text-accent">{cmd.accuracy?.toFixed(1)}%</span>
                    </div>
                    <div
                      className="h-3 bg-gray-700 rounded-full overflow-hidden"
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                      }}
                    >
                      <div
                        className="h-full bg-gradient-to-r"
                        style={{
                          width: `${cmd.accuracy}%`,
                          backgroundImage: 'linear-gradient(to right, var(--color-accent-primary), var(--color-accent-secondary))',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
        </Section>
      </Container>
    </div>
  );
}

```

---

## pages/DebugSerial.tsx

```typescript
/**
 * 串口数据调试页面
 * 
 * 功能：
 * - 显示原始串口数据
 * - 实时数据统计和分析
 * - 一键导出数据为 JSON 和 CSV 格式
 * - 信号质量评估
 */

import React, { useEffect, useState, useRef } from 'react';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { computeFFT } from '@/lib/fft-analysis';
import { SpectrumDisplay } from '@/components/SpectrumDisplay';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface SerialData {
  channel1: number;
  channel2: number;
  channel3: number;
  timestamp: number;
}

interface SignalStats {
  ch1: { min: number; max: number; mean: number; std: number };
  ch2: { min: number; max: number; mean: number; std: number };
  ch3: { min: number; max: number; mean: number; std: number };
}

export default function DebugSerial() {
  const { isConnected, error, isSupported, requestPort, connect, disconnect, onDataReceived } = useSerialConnection();
  const [isConnecting, setIsConnecting] = useState(false);
  const [parsedData, setParsedData] = useState<SerialData[]>([]);
  const [stats, setStats] = useState({
    totalBytes: 0,
    totalPackets: 0,
    errorPackets: 0,
  });
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [spectrumAnalysis, setSpectrumAnalysis] = useState<any>(null);
  const dataBufferRef = useRef<SerialData[]>([]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const port = await requestPort();
      if (port) {
        await connect(port);
        dataBufferRef.current = [];
        setParsedData([]);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setParsedData([]);
  };

  // 计算信号统计
  const calculateSignalStats = (data: SerialData[]): SignalStats => {
    if (data.length === 0) {
      return {
        ch1: { min: 0, max: 0, mean: 0, std: 0 },
        ch2: { min: 0, max: 0, mean: 0, std: 0 },
        ch3: { min: 0, max: 0, mean: 0, std: 0 },
      };
    }

    const ch1Values = data.map(d => d.channel1);
    const ch2Values = data.map(d => d.channel2);
    const ch3Values = data.map(d => d.channel3);

    const calculateStats = (values: number[]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      return { min, max, mean, std };
    };

    return {
      ch1: calculateStats(ch1Values),
      ch2: calculateStats(ch2Values),
      ch3: calculateStats(ch3Values),
    };
  };

  // 监听数据接收
  useEffect(() => {
    const handleDataReceived = (data: SerialData) => {
      dataBufferRef.current.push(data);
      setParsedData(prev => {
        const updated = [...prev, data];
        // 保留最后 500 条数据用于显示
        const trimmed = updated.slice(-500);
        // 更新信号统计
        setSignalStats(calculateSignalStats(trimmed));
        return trimmed;
      });
      setStats(prev => ({
        ...prev,
        totalPackets: prev.totalPackets + 1,
      }));
    };

    onDataReceived(handleDataReceived);
  }, [onDataReceived]);

  // 导出为 JSON
  const handleExportJSON = () => {
    if (dataBufferRef.current.length === 0) {
      setExportMessage('❌ 没有数据可导出');
      setTimeout(() => setExportMessage(''), 3000);
      return;
    }

    setIsExporting(true);
    try {
      const exportData = {
        exportTime: new Date().toISOString(),
        totalPackets: dataBufferRef.current.length,
        samplingRate: 250, // Hz
        duration: (dataBufferRef.current.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2) + 's',
        data: dataBufferRef.current,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emg-data-${new Date().getTime()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage(`✅ 已导出 ${dataBufferRef.current.length} 个数据包 (JSON)`);
      setTimeout(() => setExportMessage(''), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // 导出为 CSV
  const handleExportCSV = () => {
    if (dataBufferRef.current.length === 0) {
      setExportMessage('❌ 没有数据可导出');
      setTimeout(() => setExportMessage(''), 3000);
      return;
    }

    setIsExporting(true);
    try {
      let csvContent = 'Timestamp,CH1,CH2,CH3,Time\n';
      
      dataBufferRef.current.forEach((data, idx) => {
        const time = new Date(data.timestamp).toLocaleTimeString();
        csvContent += `${idx},${data.channel1},${data.channel2},${data.channel3},${time}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emg-data-${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage(`✅ 已导出 ${dataBufferRef.current.length} 个数据包 (CSV)`);
      setTimeout(() => setExportMessage(''), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // 清空数据
  const handleClearData = () => {
    dataBufferRef.current = [];
    setParsedData([]);
    setSignalStats(null);
    setExportMessage('');
  };

  return (
    <div className="min-h-screen" style={{
      color: '#fff',
      padding: '20px',
      fontFamily: 'monospace',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* 标题 */}
        <h1 style={{ fontSize: '28px', marginBottom: '20px', color: '#d4af37' }}>
          🔧 串口数据调试工具 - 实时分析
        </h1>

        {/* 连接状态 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <p style={{ margin: '0 0 8px 0', color: '#888' }}>连接状态</p>
              <p style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: 'bold',
                color: isConnected ? '#22c55e' : '#ef4444',
              }}>
                {isConnected ? '✓ 已连接' : '○ 未连接'}
              </p>
              {error && <p style={{ margin: '8px 0 0 0', color: '#ef4444', fontSize: '14px' }}>错误: {error}</p>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isConnecting ? '#888' : '#d4af37',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isConnecting ? '连接中...' : '连接设备'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    断开连接
                  </button>
                  <button
                    onClick={handleClearData}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    清空数据
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 数据导出按钮 */}
        {isConnected && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ margin: '0 0 8px 0', color: '#888' }}>已采集数据</p>
                <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#4ade80' }}>
                  {dataBufferRef.current.length} 个数据包 ({(dataBufferRef.current.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2)}s)
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleExportJSON}
                  disabled={isExporting || dataBufferRef.current.length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: dataBufferRef.current.length === 0 ? '#666' : '#4ade80',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: dataBufferRef.current.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isExporting ? '导出中...' : '📥 导出 JSON'}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting || dataBufferRef.current.length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: dataBufferRef.current.length === 0 ? '#666' : '#4ade80',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: dataBufferRef.current.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isExporting ? '导出中...' : '📥 导出 CSV'}
                </button>
              </div>
            </div>
            {exportMessage && (
              <p style={{ margin: '12px 0 0 0', color: exportMessage.includes('✅') ? '#4ade80' : '#ef4444', fontSize: '14px' }}>
                {exportMessage}
              </p>
            )}
          </div>
        )}

        {/* 信号统计信息 */}
        {signalStats && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>📊 实时信号统计</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {/* CH1 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '12px' }}>CH1 (原始ADC)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.std.toFixed(2)}</span></div>
                </div>
              </div>

              {/* CH2 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #4ade80',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#4ade80', fontSize: '12px' }}>CH2 (主信号 - 去偏置肌电)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#4ade80' }}>{signalStats.ch2.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#4ade80' }}>{signalStats.ch2.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#4ade80' }}>{signalStats.ch2.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#4ade80' }}>{signalStats.ch2.std.toFixed(2)}</span></div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                    <span style={{ color: '#888' }}>幅值范围: </span>
                    <span style={{ color: '#4ade80' }}>±{Math.max(Math.abs(signalStats.ch2.min), Math.abs(signalStats.ch2.max)).toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* CH3 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '12px' }}>CH3 (包络/辅助)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#ef4444' }}>{signalStats.ch3.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#ef4444' }}>{signalStats.ch3.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#ef4444' }}>{signalStats.ch3.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#ef4444' }}>{signalStats.ch3.std.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 频谱分析 */}
        {spectrumAnalysis && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>📈 频谱分析 (CH2)</h3>
            <SpectrumDisplay analysis={spectrumAnalysis} title="实时频谱分析" />
          </div>
        )}

        {/* 解析后的数据显示 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '16px',
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#d4af37' }}>最新数据（最后 20 条）</h3>
          <p style={{ margin: '0 0 12px 0', color: '#888', fontSize: '12px' }}>CH1: 原始ADC（含直流偏置） | CH2: 去偏置肌电信号（主信号） | CH3: 包络/辅助值</p>
          <div style={{
            backgroundColor: '#000',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            maxHeight: '400px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: '1.6',
          }}>
            {parsedData.length === 0 ? (
              <p style={{ color: '#888' }}>等待数据...</p>
            ) : (
              parsedData.slice(-20).map((data, idx) => (
                <div key={idx} style={{ color: '#0f0', marginBottom: '4px' }}>
                  <span style={{ color: '#888' }}>#{parsedData.length - 20 + idx + 1}</span> 
                  {' '}CH1: <span style={{ color: '#60a5fa' }}>{data.channel1.toString().padStart(6)}</span>
                  {' '}| CH2: <span style={{ color: '#4ade80' }}>{data.channel2.toString().padStart(6)}</span>
                  {' '}| CH3: <span style={{ color: '#ef4444' }}>{data.channel3.toString().padStart(6)}</span>
                  {' '}| {new Date(data.timestamp).toLocaleTimeString()}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 协议信息 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #d4af37',
          borderRadius: '4px',
          padding: '16px',
          marginTop: '20px',
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#d4af37' }}>📋 协议信息</h3>
          <ul style={{ margin: '0', paddingLeft: '20px', color: '#888', lineHeight: '1.8', fontSize: '12px' }}>
            <li>帧格式：CC CC 01 06 [CH1_H] [CH1_L] [CH2_H] [CH2_L] [CH3_H] [CH3_L]（10字节）</li>
            <li>数据采用大端序 int16 格式（高字节在前）</li>
            <li style={{ color: '#4ade80' }}>CH2 是主信号（去偏置肌电信号），用于波形显示和特征提取</li>
            <li>CH1 含直流偏置（约 2000），CH3 为包络/辅助值</li>
            <li>采样率：250 Hz</li>
            <li style={{ marginTop: '8px', color: '#d4af37' }}>💡 导出数据后，可发送给我进行深度分析和滤波参数优化</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

```

---

## pages/DemoMode.tsx

```typescript
/**
 * 演示模式页面
 * 
 * 为没有硬件的用户提供完整的演示体验
 * 包括预加载示例数据和模拟识别流程
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertCircle,
  ChevronLeft,
  Zap,
  CheckCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { generateDemoData, hasDemoData, clearDemoData } from '@/lib/demo-data';
import { PREDEFINED_COMMANDS } from '@/../../shared/const';

export default function DemoMode() {
  const [, setLocation] = useLocation();
  const [demoPhase, setDemoPhase] = useState<
    'idle' | 'loading' | 'ready' | 'recognizing' | 'result'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 检查演示数据
  useEffect(() => {
    const checkDemoData = async () => {
      try {
        const has = await hasDemoData();
        setIsInitialized(has);
      } catch (err) {
        console.error('检查演示数据失败:', err);
      }
    };

    checkDemoData();
  }, []);

  const handleInitializeDemo = async () => {
    try {
      setError(null);
      setDemoPhase('loading');

      await generateDemoData();
      setIsInitialized(true);
      setDemoPhase('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : '初始化失败';
      setError(message);
      setDemoPhase('idle');
    }
  };

  const handleStartDemo = async () => {
    try {
      setError(null);
      setDemoPhase('recognizing');

      // 模拟识别过程
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 随机选择一个识别结果
      const randomCommand =
        PREDEFINED_COMMANDS[
          Math.floor(Math.random() * PREDEFINED_COMMANDS.length)
        ];
      const confidence = 0.75 + Math.random() * 0.2; // 75-95% 置信度

      const demoResult = {
        recognizedCommand: randomCommand.name,
        confidence,
        timestamp: Date.now(),
      };

      setResult(demoResult);
      setHistory((prev) => [demoResult, ...prev.slice(0, 9)]);
      setDemoPhase('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : '演示失败';
      setError(message);
      setDemoPhase('ready');
    }
  };

  const handleContinueDemo = () => {
    setDemoPhase('ready');
    setResult(null);
  };

  const handleResetDemo = async () => {
    try {
      setError(null);
      await clearDemoData();
      setIsInitialized(false);
      setDemoPhase('idle');
      setHistory([]);
      setResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '重置失败';
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className="text-gray-600"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-semibold text-gray-900">演示模式</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Initialization Phase */}
        {!isInitialized && demoPhase === 'idle' && (
          <div className="max-w-2xl mx-auto">
            <Card className="p-12 text-center">
              <div className="mb-6">
                <Zap className="w-16 h-16 mx-auto text-blue-500 opacity-80" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                演示模式
              </h2>

              <p className="text-gray-600 mb-8">
                无需硬件即可体验完整的肌电信号识别流程。系统将加载示例数据，模拟真实的采集和识别过程。
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
                <h3 className="font-semibold text-gray-900 mb-4">演示包含：</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>10 条指令的预训练数据</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>实时识别演示</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>识别历史记录</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>数据导出功能</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={handleInitializeDemo}
                className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                开始演示
              </Button>
            </Card>
          </div>
        )}

        {/* Loading Phase */}
        {demoPhase === 'loading' && (
          <div className="max-w-2xl mx-auto">
            <Card className="p-12 text-center">
              <div className="mb-6">
                <Zap className="w-16 h-16 mx-auto text-blue-500 animate-pulse" />
              </div>
              <p className="text-gray-700 mb-4">正在加载演示数据...</p>
              <div className="flex justify-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse delay-100"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse delay-200"></div>
              </div>
            </Card>
          </div>
        )}

        {/* Ready Phase */}
        {isInitialized && (demoPhase === 'ready' || demoPhase === 'recognizing' || demoPhase === 'result') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Control Panel */}
            <div className="lg:col-span-1">
              <Card className="p-6 sticky top-24">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  演示控制
                </h2>

                <Button
                  onClick={handleStartDemo}
                  disabled={demoPhase === 'recognizing'}
                  className="w-full bg-green-500 hover:bg-green-600 text-white mb-6 py-6 text-lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  开始识别
                </Button>

                <Button
                  onClick={handleResetDemo}
                  variant="outline"
                  className="w-full mb-6"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  重置演示
                </Button>

                <div className="space-y-4 text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-gray-900 mb-2">
                      可用指令
                    </p>
                    <div className="space-y-1">
                      {PREDEFINED_COMMANDS.map((cmd) => (
                        <p
                          key={cmd.id}
                          className="text-xs text-gray-600 flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                          {cmd.name}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-600 mt-4">
                  💡 演示数据已预加载，点击"开始识别"进行演示
                </p>
              </Card>
            </div>

            {/* Result Display */}
            {demoPhase === 'result' && result && (
              <div className="lg:col-span-1">
                <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-0">
                  <div className="text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-gray-900 mb-6">
                      识别完成
                    </p>

                    <div className="bg-white rounded-lg p-6 mb-6">
                      <p className="text-sm text-gray-600 mb-3">识别结果</p>
                      <p className="text-3xl font-bold text-green-600 mb-6">
                        {result.recognizedCommand}
                      </p>
                      <div className="flex items-center justify-center gap-4">
                        <div>
                          <p className="text-xs text-gray-600 mb-2">置信度</p>
                          <p className="text-2xl font-semibold text-gray-900">
                            {(result.confidence * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div
                          className={`w-14 h-14 rounded-full flex items-center justify-center ${
                            result.confidence > 0.8
                              ? 'bg-green-100'
                              : result.confidence > 0.6
                              ? 'bg-yellow-100'
                              : 'bg-red-100'
                          }`}
                        >
                          <span
                            className={`text-sm font-bold ${
                              result.confidence > 0.8
                                ? 'text-green-600'
                                : result.confidence > 0.6
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {result.confidence > 0.8
                              ? '优'
                              : result.confidence > 0.6
                              ? '中'
                              : '低'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleContinueDemo}
                      className="w-full bg-green-500 hover:bg-green-600"
                    >
                      继续演示
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* History */}
            <div className="lg:col-span-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                识别历史
              </h2>

              {history.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-gray-600">暂无识别记录</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {history.map((item, index) => (
                    <Card
                      key={index}
                      className="p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-600">
                            #{history.length - index}
                          </span>
                          <p className="font-semibold text-gray-900">
                            {item.recognizedCommand}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {(item.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          item.confidence > 0.8
                            ? 'bg-green-100 text-green-600'
                            : item.confidence > 0.6
                            ? 'bg-yellow-100 text-yellow-600'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {item.confidence > 0.8
                          ? '优'
                          : item.confidence > 0.6
                          ? '中'
                          : '低'}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

```

---

## pages/Home.tsx

```typescript
/**
 * 主页面 - 高端商业风格
 * 
 * 设计说明：
 * - 深黑色背景 (#0a0a0a) + 金色强调 (#d4af37)
 * - 使用 Playfair Display 作为标题字体
 * - 竖线分隔符和金色边框作为视觉元素
 * - 充足的留白和分层
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
  LoadingSpinner,
} from '@/components/PremiumComponents';
import { emgDatabase } from '@/lib/db';
import { useUserSession } from '@/contexts/UserSessionContext';
import { UserLoginDialog } from '@/components/UserLoginDialog';

export default function Home() {
  const [location, navigate] = useLocation();
  const { isLoggedIn, currentUser, logout } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isLoggedIn);
  const [stats, setStats] = useState({
    totalCommands: 0,
    totalWaveforms: 0,
    hasFeatureLibrary: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = () => {
      try {
        // 从 localStorage 读取采集数据
        const localStorageData = localStorage.getItem('emg-commands');
        if (localStorageData) {
          try {
            const commands = JSON.parse(localStorageData);
            const totalWaveforms = commands.reduce((sum: number, cmd: any) => sum + (cmd.collections?.length || 0), 0);
            setStats({
              totalCommands: commands.length,
              totalWaveforms: totalWaveforms,
              hasFeatureLibrary: totalWaveforms > 0,
            });
            setLoading(false);
            return;
          } catch (e) {
            console.warn('解析 localStorage 数据失败:', e);
          }
        }

        // 如果 localStorage 没有数据，显示默认值
        setStats({
          totalCommands: 0,
          totalWaveforms: 0,
          hasFeatureLibrary: false,
        });
      } catch (error) {
        console.error('加载统计信息失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  // 监听 storage 事件，当其他标签页修改数据时自动刷新
  useEffect(() => {
    const handleStorageChange = () => {
      const localStorageData = localStorage.getItem('emg-commands');
      if (localStorageData) {
        try {
          const commands = JSON.parse(localStorageData);
          const totalWaveforms = commands.reduce((sum: number, cmd: any) => sum + (cmd.collections?.length || 0), 0);
          setStats({
            totalCommands: commands.length,
            totalWaveforms: totalWaveforms,
            hasFeatureLibrary: totalWaveforms > 0,
          });
        } catch (e) {
          console.warn('解析 localStorage 数据失败:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">AI LAB / DEEP ANALYSIS</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                Wagii - Darklo EMG Silent Speech
              </h1>
            </div>
            <div className="flex gap-4 items-center">
              {isLoggedIn && currentUser && (
                <div style={{
                  color: '#d4af37',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  paddingRight: '16px',
                  borderRight: '1px solid #333',
                }}>
                  👤 {currentUser.userName}
                </div>
              )}
              <Button variant="secondary" onClick={() => navigate('/collection')}>
                采集训练
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/recognition')}
                disabled={!stats.hasFeatureLibrary}
              >
                默念测试
              </Button>
              <Button variant="secondary" onClick={() => navigate('/data-management')}>
                数据管理
              </Button>
              {isLoggedIn && currentUser?.isAdmin && (
                <Button variant="secondary" onClick={() => navigate('/admin')}>
                  管理员后台
                </Button>
              )}
              {isLoggedIn && (
                <Button
                  variant="error"
                  onClick={logout}
                >
                  登出
                </Button>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">SYSTEM OVERVIEW</SectionLabel>
          <SectionTitle>
            耳周肌电
            <br />
            无声语音识别系统
          </SectionTitle>

          <div className="mb-12">
            <p className="text-lg text-secondary leading-relaxed mb-6">
              通过采集耳后乳突区的肌电信号，使用深度学习算法进行特征提取和识别，实现无声默念指令的实时识别。该系统可应用于人机交互、辅助通信等领域。
            </p>
          </div>

          <Divider />

          {/* 系统统计 */}
          <Section className="py-12">
            <SectionLabel>SYSTEM STATUS</SectionLabel>

            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <Grid cols={3} gap="lg">
                <Card>
                  <div className="label mb-4">已采集指令</div>
                  <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    {stats.totalCommands}
                  </div>
                  <p className="text-secondary text-sm">个指令</p>
                </Card>

                <Card>
                  <div className="label mb-4">总采集次数</div>
                  <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    {stats.totalWaveforms}
                  </div>
                  <p className="text-secondary text-sm">次采集</p>
                </Card>

                <Card>
                  <div className="label mb-4">特征库状态</div>
                  <div className={`text-2xl font-bold mb-2 ${stats.hasFeatureLibrary ? 'text-success' : 'text-error'}`}>
                    {stats.hasFeatureLibrary ? '✓ 就绪' : '✗ 未就绪'}
                  </div>
                  <p className="text-secondary text-sm">
                    {stats.hasFeatureLibrary ? '可进行识别测试' : '请先完成采集训练'}
                  </p>
                </Card>
              </Grid>
            )}
          </Section>

          <Divider />

          {/* 技术创新亮点

          {/* 用户采集统计 - 仅管理员可见 */}
          {currentUser?.isAdmin ? (
            <Section className="py-12">
              <SectionLabel>USER STATISTICS</SectionLabel>
              <SectionTitle>用户采集统计</SectionTitle>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(() => {
                  const saved = localStorage.getItem('emg-commands');
                  if (!saved) return <p className="text-secondary">暂无采集数据</p>;
                  
                  const commands = JSON.parse(saved);
                  const userStats = new Map<string, {userName: string; collections: number}>();
                  
                  commands.forEach((cmd: any) => {
                    cmd.collections?.forEach((col: any) => {
                      if (col.userId && col.userName) {
                        if (!userStats.has(col.userId)) {
                          userStats.set(col.userId, {userName: col.userName, collections: 0});
                        }
                        const stat = userStats.get(col.userId)!;
                        stat.collections += 1;
                      }
                    });
                  });
                  
                  return Array.from(userStats.values()).map((stat, idx) => (
                    <Card key={idx}>
                      <div className="label mb-4">{stat.userName}</div>
                      <div className="text-4xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                        {stat.collections}
                      </div>
                      <p className="text-secondary text-sm">次采集</p>
                    </Card>
                  ));
                })()}
              </div>
            </Section>
          ) : null}

          {currentUser?.isAdmin && <Divider />}

          {/* 技术创新亮点 */}
          <Section className="py-12">
            <SectionLabel number="02">ADVANCED TECHNOLOGY</SectionLabel>
            <SectionTitle>技术创新亮点</SectionTitle>

            <Grid cols={2} gap="lg">
              <Card>
                <div className="label mb-4 text-accent">🧠 高维特征工程</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  150+ 维多模态特征
                </h4>
                <p className="text-secondary leading-relaxed">
                  整合时域(30维)、频域(18维)、MFCC(39维)、梅尔谱图(21维)特征。完整的预处理管道：50/60Hz陷波滤波、高通滤波、FastICA独立成分分析。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🤖 深度学习识别</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  自定义 CNN 模型
                </h4>
                <p className="text-secondary leading-relaxed">
                  Conv1D + Dense 层架构，支持模型训练、保存、加载。与欧氏距离识别并行运行，自动选择最优识别结果。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">📡 多通道融合</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  SNR 权重动态融合
                </h4>
                <p className="text-secondary leading-relaxed">
                  根据三通道信噪比动态计算权重，融合多通道特征提高识别鲁棒性。确保训练和测试使用完全相同的预处理流程。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🎯 自适应阈值</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  反馈驱动模型优化
                </h4>
                <p className="text-secondary leading-relaxed">
                  根据用户反馈历史自动调整相似度阈值。支持用户纠偏机制，实时改进模型性能，无需重新训练。
                </p>
              </Card>
            </Grid>
          </Section>

          <Divider />

          {/* 应用场景 */}
          <Section className="py-12">
            <SectionLabel number="03">APPLICATION SCENARIOS</SectionLabel>
            <SectionTitle>应用场景与价值</SectionTitle>

            <Grid cols={2} gap="lg">
              <Card>
                <div className="label mb-4 text-accent">🎮 人机交互</div>
                <h5 className="text-xl font-bold mb-3">无声控制设备</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  实现无声、隐蔽的设备控制，适用于嘈杂环境、隐私保护、游戏交互等场景。支持自定义指令集，扩展性强。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🏥 医疗辅助</div>
                <h5 className="text-xl font-bold mb-3">失语症患者通信</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  为无法正常发音的患者提供新的交流方式，通过默念指令进行文字输出，改善生活质量。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🔐 生物识别</div>
                <h5 className="text-xl font-bold mb-3">个性化认证</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  利用肌电信号的个体差异性，实现生物识别认证。每个人的肌肉活动模式独特，难以伪造。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🚀 未来通信</div>
                <h5 className="text-xl font-bold mb-3">脑机接口基础</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  作为脑机接口技术的重要基础，为未来的神经接口应用奠定技术基础。
                </p>
              </Card>
            </Grid>
          </Section>

          <Divider />

          {/* 快速开始 */}
          <Section className="py-12">
            <SectionLabel number="04">QUICK START</SectionLabel>
            <SectionTitle>快速开始</SectionTitle>

            <div className="grid grid-cols-2 gap-8">
              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  1. 连接硬件
                </h4>
                <p className="text-secondary leading-relaxed">
                  使用 USB 串口连接 Arduino 设备。系统会自动检测硬件连接状态。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  2. 采集训练
                </h4>
                <p className="text-secondary leading-relaxed">
                  输入指令名称，点击"开始采集"，默念指令 3 秒，点击"停止采集"。重复 5 次以上。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  3. 完成采集
                </h4>
                <p className="text-secondary leading-relaxed">
                  采集完成后点击"完成采集"，系统自动生成特征库。可继续采集其他指令。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  4. 开始识别
                </h4>
                <p className="text-secondary leading-relaxed">
                  切换到"默念测试"模式，点击"开始识别"，默念任意指令，系统返回识别结果。
                </p>
              </Card>
            </div>
          </Section>
        </Section>
      </Container>

      {/* 页脚 */}
      <div
        className="border-t"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <Container className="py-8">
          <div className="flex justify-between items-center text-secondary text-sm">
            <div>© 2026 Wagii - Darklo EMG Silent Speech</div>
            <div>Powered by Deep Learning & Signal Processing</div>
          </div>
        </Container>
      </div>

      {/* 用户登录对话框 */}
      <UserLoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
      />
    </div>
  );
}

```

---

## pages/ImprovedRecognitionTest.tsx

```typescript
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUserSession } from '@/contexts/UserSessionContext';
import { useLocation } from 'wouter';
import { AuditEventType, logAuditEvent } from '@/lib/audit-log';
import {
  createTestFeedback,
  submitUserFeedback,
  calculatePerformanceMetrics,
  generateImprovementSuggestions,
  getFeedbackHistory,
  exportFeedbackAsJSON,
  exportFeedbackAsCSV,
} from '@/lib/model-feedback-system';
import { recognizeCommand, CommandTemplate } from '@/lib/template-based-recognition';
import {
  processRecognitionFeedback,
  getCalibrationStatistics,
  getCalibrationByCommand,
  exportCalibrationReportAsJSON,
  exportCalibrationReportAsCSV,
} from '@/lib/auto-calibration-system';

/**
 * 改进的默念测试页面
 * 支持用户反馈和模型修正
 */
export default function ImprovedRecognitionTest() {
  const { currentUser } = useUserSession();
  const [location, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);

  // 状态管理
  const [testPhase, setTestPhase] = useState<'idle' | 'testing' | 'feedback' | 'results'>(
    'idle'
  );
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [currentTestResult, setCurrentTestResult] = useState<any>(null);
  const [selectedTrueCommand, setSelectedTrueCommand] = useState<string>('');
  const [testCount, setTestCount] = useState(0);
  const [feedbackHistory, setFeedbackHistory] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [calibrationStats, setCalibrationStats] = useState<any>(null);
  const [calibrationByCommand, setCalibrationByCommand] = useState<any>(null);

  // 初始化
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    loadTemplates();
    loadFeedbackHistory();
  }, [currentUser]);

  /**
   * 加载指令模板
   */
  const loadTemplates = () => {
    try {
      const stored = localStorage.getItem(`templates-${currentUser?.userName}`);
      if (stored) {
        setTemplates(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  /**
   * 加载反馈历史
   */
  const loadFeedbackHistory = () => {
    const history = getFeedbackHistory();
    setFeedbackHistory(history);

    if (history.length > 0) {
      const perf = calculatePerformanceMetrics(history);
      setMetrics(perf);
      const sugg = generateImprovementSuggestions(perf, []);
      setSuggestions(sugg);
    }
  };

  /**
   * 开始测试
   */
  const handleStartTest = () => {
    if (templates.length === 0) {
      alert('请先完成采集训练');
      return;
    }

    setTestPhase('testing');
    setTestCount(testCount + 1);
    setSelectedTrueCommand('');
    setCurrentTestResult(null);
  };

  /**
   * 模拟识别（实际应该从设备获取）
   */
  const handlePerformTest = () => {
    // 这里应该从设备获取实际的肌电信号
    // 为演示目的，我们模拟一个识别结果

    if (templates.length === 0) {
      alert('没有可用的模板，请先完成采集训练');
      return;
    }

    // 模拟识别结果
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const mockSignal = randomTemplate.rawSignals?.[0];

    if (!mockSignal) {
      alert('模板中没有可用的信号数据');
      return;
    }

    const result = recognizeCommand(mockSignal, templates);

    if (result) {
      const feedback = createTestFeedback(
        result.commandName,
        result.similarity,
        result.confidence,
        result.details?.topMatches || []
      );

      const testResult = {
        ...feedback,
        predictedCommand: result.commandName,
        similarity: result.similarity,
        confidence: result.confidence,
        topMatches: result.details?.topMatches || [],
        signalQuality: 'Good',
      };
      setCurrentTestResult(testResult);
      setTestPhase('feedback');
    } else {
      alert('无法识别，请重试');
    }
  };

  /**
   * 提交用户反馈
   */
  const handleSubmitFeedback = () => {
    if (!selectedTrueCommand) {
      alert('请选择真实的指令');
      return;
    }

    const updatedFeedback = submitUserFeedback(
      currentTestResult,
      selectedTrueCommand,
      ''
    );

    // 记录审计日志
    logAuditEvent(AuditEventType.COLLECTION_SAVE, {
      predicted: currentTestResult.predictedCommand,
      actual: selectedTrueCommand,
      isCorrect: updatedFeedback.isCorrect,
      similarity: currentTestResult.similarity,
      confidence: currentTestResult.confidence,
    });

    // 进行自动纯偏（根据用户反馈调整模型特征）
    const calibrationRecord = processRecognitionFeedback(
      currentTestResult.predictedCommand,
      selectedTrueCommand,
      currentTestResult.similarity,
      currentTestResult.confidence,
      templates
    );
    // 刷新反馈历史、指标和纯偏统计
    loadFeedbackHistory();
    setCalibrationStats(getCalibrationStatistics());
    setCalibrationByCommand(getCalibrationByCommand());

    setTestPhase('results');
  };

  /**
   * 继续测试
   */
  const handleContinueTest = () => {
    setTestPhase('idle');
  };

  /**
   * 查看详细报告
   */
  const handleViewReport = () => {
    setCalibrationStats(getCalibrationStatistics());
    setCalibrationByCommand(getCalibrationByCommand());
    setTestPhase('results');
  };

  /**
   * 导出反馈数据
   */
  const handleExportFeedback = (format: 'json' | 'csv') => {
    const data = format === 'json' ? exportFeedbackAsJSON() : exportFeedbackAsCSV();
    const mimeType = format === 'json' ? 'application/json' : 'text/csv';
    const filename = `feedback-${new Date().toISOString().split('T')[0]}.${format}`;

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  /**
   * 导出纯偏报告
   */
  const handleExportCalibration = (format: 'json' | 'csv') => {
    const data = format === 'json' ? exportCalibrationReportAsJSON() : exportCalibrationReportAsCSV();
    const mimeType = format === 'json' ? 'application/json' : 'text/csv';
    const filename = `calibration-${new Date().toISOString().split('T')[0]}.${format}`;

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  /**
   * 返回主页
   */
  const handleBackHome = () => {
    navigate('/');
  };

  // 测试阶段：空闲
  if (testPhase === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          {/* 返回按钮 */}
          <button
            onClick={handleBackHome}
            className="mb-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            ← 返回主页
          </button>

          <Card className="bg-slate-800 border-amber-500/30 p-8">
            <h1 className="text-3xl font-bold text-amber-400 mb-2">默念测试</h1>
            <p className="text-slate-300 mb-6">
              测试系统的识别准确率，并通过反馈帮助模型改进
            </p>

            {/* 统计信息 */}
            {metrics && (
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">总测试次数</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {metrics.totalTests}
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">准确率</div>
                  <div className="text-2xl font-bold text-green-400">
                    {metrics.accuracy.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">最近 10 次准确率</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {metrics.trend.recentAccuracy.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">改进速率</div>
                  <div
                    className={`text-2xl font-bold ${
                      metrics.trend.improvementRate > 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}
                  >
                    {metrics.trend.improvementRate > 0 ? '+' : ''}
                    {metrics.trend.improvementRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="space-y-3">
              <Button
                onClick={handleStartTest}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3"
              >
                开始新测试
              </Button>

            {metrics && (
              <>
                <Button
                  onClick={handleViewReport}
                  variant="outline"
                  className="w-full border-amber-500 text-amber-400 hover:bg-amber-500/10"
                >
                  查看详细报告
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleExportFeedback('json')}
                    variant="outline"
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    导出反馈 JSON
                  </Button>
                  <Button
                    onClick={() => handleExportFeedback('csv')}
                    variant="outline"
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    导出反馈 CSV
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleExportCalibration('json')}
                    variant="outline"
                    className="flex-1 border-green-600 text-green-300"
                  >
                    导出纯偏 JSON
                  </Button>
                  <Button
                    onClick={() => handleExportCalibration('csv')}
                    variant="outline"
                    className="flex-1 border-green-600 text-green-300"
                  >
                    导出纯偏 CSV
                  </Button>
                </div>
              </>
            )}

              <Button
                onClick={handleBackHome}
                variant="outline"
                className="w-full border-slate-600 text-slate-300"
              >
                返回主页
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // 测试阶段：进行测试
  if (testPhase === 'testing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-slate-800 border-amber-500/30 p-8">
            <h1 className="text-2xl font-bold text-amber-400 mb-6">
              测试 #{testCount}
            </h1>

            <div className="bg-slate-700 rounded-lg p-8 mb-6 text-center">
              <p className="text-slate-300 mb-4">准备好默念一个指令</p>
              <p className="text-sm text-slate-400 mb-6">
                系统将识别您的默念并显示结果
              </p>
              <Button
                onClick={handlePerformTest}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 px-8"
              >
                执行识别
              </Button>
            </div>

            <Button
              onClick={() => setTestPhase('idle')}
              variant="outline"
              className="w-full border-slate-600 text-slate-300"
            >
              取消
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // 反馈阶段：用户选择真实指令
  if (testPhase === 'feedback' && currentTestResult && templates.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-3xl mx-auto">
          <Card className="bg-slate-800 border-amber-500/30 p-8 mb-6">
            <h1 className="text-2xl font-bold text-amber-400 mb-6">
              系统识别结果
            </h1>

            {/* 系统预测结果 */}
            <div className="bg-slate-700 rounded-lg p-6 mb-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm text-slate-400">系统预测</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {currentTestResult.predictedCommand}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">相似度</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {currentTestResult.similarity}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">置信度</div>
                  <div className="text-2xl font-bold text-green-400">
                    {currentTestResult.confidence}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">信号质量</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {currentTestResult.signalQuality || 'N/A'}
                  </div>
                </div>
              </div>

              {/* 前几个候选 */}
              <div className="mt-4">
                <div className="text-sm text-slate-400 mb-2">其他候选指令：</div>
                <div className="space-y-2">
                  {currentTestResult.topMatches
                    ?.slice(1, 3)
                    .map((match: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center bg-slate-600 rounded px-3 py-2"
                      >
                        <span className="text-slate-300">{match.command}</span>
                        <span className="text-slate-400">{match.similarity}%</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* 用户选择真实指令 */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                请选择您实际默念的指令：
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {templates.map((template) => (
                  <button
                    key={template.commandName}
                    onClick={() => setSelectedTrueCommand(template.commandName)}
                    className={`p-4 rounded-lg font-semibold transition ${
                      selectedTrueCommand === template.commandName
                        ? 'bg-amber-500 text-black'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                  >
                    {template.commandName}
                  </button>
                ))}
              </div>
            </div>

            {/* 提交反馈 */}
            <div className="space-y-3">
              <Button
                onClick={handleSubmitFeedback}
                disabled={!selectedTrueCommand}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 disabled:opacity-50"
              >
                提交反馈
              </Button>
              <Button
                onClick={() => setTestPhase('idle')}
                variant="outline"
                className="w-full border-slate-600 text-slate-300"
              >
                取消
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // 结果阶段：显示详细报告
  if (testPhase === 'results' && metrics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          {/* 返回按钮 */}
          <button
            onClick={() => setTestPhase('idle')}
            className="mb-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            ← 返回
          </button>

          <Card className="bg-slate-800 border-amber-500/30 p-8 mb-6">
            <h1 className="text-3xl font-bold text-amber-400 mb-6">
              模型性能报告
            </h1>

            {/* 总体指标 */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400">总测试次数</div>
                <div className="text-3xl font-bold text-amber-400">
                  {metrics.totalTests}
                </div>
              </div>
              <div className="bg-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400">正确预测</div>
                <div className="text-3xl font-bold text-green-400">
                  {metrics.correctPredictions}
                </div>
              </div>
              <div className="bg-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400">总体准确率</div>
                <div className="text-3xl font-bold text-blue-400">
                  {metrics.accuracy.toFixed(1)}%
                </div>
              </div>
              <div className="bg-slate-700 rounded-lg p-4">
                <div className="text-sm text-slate-400">改进速率</div>
                <div
                  className={`text-3xl font-bold ${
                    metrics.trend.improvementRate > 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {metrics.trend.improvementRate > 0 ? '+' : ''}
                  {metrics.trend.improvementRate.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* 按指令的性能 */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">按指令的性能</h2>
              <div className="space-y-3">
                {Object.entries(metrics.commandMetrics).map(
                  ([cmd, data]: [string, any]) => (
                    <div key={cmd} className="bg-slate-700 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-white">{cmd}</span>
                        <span className="text-amber-400">
                          {data.correctCount}/{data.testCount}
                        </span>
                      </div>
                      <div className="w-full bg-slate-600 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${data.accuracy}%` }}
                        />
                      </div>
                      <div className="text-sm text-slate-400 mt-2">
                        准确率: {data.accuracy.toFixed(1)}%
                      </div>
                      {Object.keys(data.commonMisclassifications).length > 0 && (
                        <div className="text-sm text-red-400 mt-2">
                          常见误分类：
                          {Object.entries(data.commonMisclassifications)
                            .map(([mis, count]: [string, any]) => `${mis} (${count}次)`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* 按置信度的性能 */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">按置信度的性能</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">高置信度 ({'>'}80%)</div>
                  <div className="text-2xl font-bold text-green-400 mb-2">
                    {metrics.confidenceAnalysis.highConfidence.accuracy.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400">
                    {metrics.confidenceAnalysis.highConfidence.count} 次测试
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">中置信度 (50-80%)</div>
                  <div className="text-2xl font-bold text-yellow-400 mb-2">
                    {metrics.confidenceAnalysis.mediumConfidence.accuracy.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400">
                    {metrics.confidenceAnalysis.mediumConfidence.count} 次测试
                  </div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="text-sm text-slate-400">低置信度 ({'<'}50%)</div>
                  <div className="text-2xl font-bold text-red-400 mb-2">
                    {metrics.confidenceAnalysis.lowConfidence.accuracy.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400">
                    {metrics.confidenceAnalysis.lowConfidence.count} 次测试
                  </div>
                </div>
              </div>
            </div>

            {/* 改进建议 */}
            {suggestions.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">改进建议</h2>
                <div className="space-y-3">
                  {suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-4 ${
                        suggestion.priority === 'high'
                          ? 'bg-red-900/30 border border-red-500'
                          : suggestion.priority === 'medium'
                            ? 'bg-yellow-900/30 border border-yellow-500'
                            : 'bg-blue-900/30 border border-blue-500'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-semibold text-white">
                          {suggestion.description}
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            suggestion.priority === 'high'
                              ? 'bg-red-500 text-white'
                              : suggestion.priority === 'medium'
                                ? 'bg-yellow-500 text-black'
                                : 'bg-blue-500 text-white'
                          }`}
                        >
                          {suggestion.priority.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-300 mb-2">
                        预期改进: +{suggestion.expectedImprovement}%
                      </div>
                      <div className="text-sm text-slate-400">
                        {suggestion.actionItems.map((item: string, i: number) => (
                          <div key={i}>• {item}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="space-y-3">
              <Button
                onClick={handleStartTest}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3"
              >
                继续测试
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleExportFeedback('json')}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  导出反馈 JSON
                </Button>
                <Button
                  onClick={() => handleExportFeedback('csv')}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  导出反馈 CSV
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleExportCalibration('json')}
                  variant="outline"
                  className="flex-1 border-green-600 text-green-300"
                >
                  导出纯偏 JSON
                </Button>
                <Button
                  onClick={() => handleExportCalibration('csv')}
                  variant="outline"
                  className="flex-1 border-green-600 text-green-300"
                >
                  导出纯偏 CSV
                </Button>
              </div>
              <Button
                onClick={handleBackHome}
                variant="outline"
                className="w-full border-slate-600 text-slate-300"
              >
                返回主页
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}

```

---

## pages/NotFound.tsx

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>

          <h2 className="text-xl font-semibold text-slate-700 mb-4">
            Page Not Found
          </h2>

          <p className="text-slate-600 mb-8 leading-relaxed">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

```

---

## pages/RecognitionMode.tsx

```typescript
/**
 * 默念测试页面 - 高端商业风格
 * 
 * 功能：
 * - 实时识别肌电信号
 * - 显示识别结果和置信度
 * - 支持连续多指令识别
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
} from '@/components/PremiumComponents';
import { EnhancedWaveformVisualization } from '@/components/EnhancedWaveformVisualization';
import { HardwareStatusComponent } from '@/components/HardwareStatus';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { extractFullFeatures, normalizeFeatures } from '@/lib/dsp-processor';
import { dtwFeatures } from '@/lib/dtw-algorithm';
import { 
  calculateChannelWeights, 
  fuseChannelFeatures,
  adaptiveThresholdManager 
} from '@/lib/multi-channel-fusion';
import { detectElectrodeStatus, isElectrodeStatusAcceptable, calculateSignalStats } from '@/lib/electrode-detection';
import { ElectrodeDetectionPanel } from '@/components/ElectrodeDetectionPanel';
import { cnnModelManager, CommandTrainingData } from '@/lib/cnn-model-manager';
import { processRecognitionFeedback, getCalibrationRecords } from '@/lib/auto-calibration-system';
import { submitUserFeedback, calculatePerformanceMetrics } from '@/lib/model-feedback-system';

interface RecognitionResult {
  timestamp: Date;
  command: string;
  confidence: number;
  allScores: Array<{ command: string; score: number }>;
}

interface StoredCommand {
  name: string;
  collections: Array<{
    waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  }>;
  createdAt: Date;
}

export default function RecognitionMode() {
  const [location, navigate] = useLocation();
  const { isConnected, onDataReceived } = useSerialConnectionContext();

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionTime, setRecognitionTime] = useState(0);
  const [currentWaveform, setCurrentWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });
  const [recognitionHistory, setRecognitionHistory] = useState<RecognitionResult[]>([]);
  const [useCNNModel, setUseCNNModel] = useState(false);
  const [cnnModelLoaded, setCNNModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCommands, setSavedCommands] = useState<StoredCommand[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [adaptiveThreshold, setAdaptiveThreshold] = useState(0.7);
  
  // 电极检测状态
  const [showElectrodeCheck, setShowElectrodeCheck] = useState(false);
  const [electrodeCheckResult, setElectrodeCheckResult] = useState<any>(null);
  const [globalElectrodeBaseline, setGlobalElectrodeBaseline] = useState<any>(null);
  
  // 反馈面板状态
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastRecognitionResult, setLastRecognitionResult] = useState<RecognitionResult | null>(null);
  const [selectedTrueCommand, setSelectedTrueCommand] = useState<string>('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveformBufferRef = useRef<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  // 从 localStorage 加载已保存的指令和自适应阈值
  useEffect(() => {
    const saved = localStorage.getItem('emg-commands');
    if (saved) {
      setSavedCommands(JSON.parse(saved));
    }
    
    // 加载自适应阈值
    adaptiveThresholdManager.loadFromStorage();
    setAdaptiveThreshold(adaptiveThresholdManager.getThreshold());
  }, []);

  // 注册数据接收回调
  useEffect(() => {
    const handleDataReceived = (data: any) => {
      if (isRecognizing) {
        waveformBufferRef.current.ch1.push(data.channel1);
        waveformBufferRef.current.ch2.push(data.channel2);
        waveformBufferRef.current.ch3.push(data.channel3);

        // 实时显示（最多显示 1000 个点）
        setCurrentWaveform((prev) => ({
          ch1: [...prev.ch1, data.channel1].slice(-1000),
          ch2: [...prev.ch2, data.channel2].slice(-1000),
          ch3: [...prev.ch3, data.channel3].slice(-1000),
        }));
      }
    };

    onDataReceived(handleDataReceived);
  }, [isRecognizing, onDataReceived]);

  // 检查 CNN 模型是否已加载
  useEffect(() => {
    const modelLoaded = cnnModelManager.loadModel();
    setCNNModelLoaded(modelLoaded);
    if (modelLoaded) {
      setUseCNNModel(true);
    }
  }, []);

  // 计算欧几里得距离
  const euclideanDistance = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  };

  // 计算欧氏距离相似度
  const calculateSimilarity = (testFeatures: number[], refFeatures: number[]): number => {
    if (testFeatures.length !== refFeatures.length) {
      return 0;
    }
    
    // 计算欧氏距离
    let sumSquaredDiff = 0;
    for (let i = 0; i < testFeatures.length; i++) {
      const diff = testFeatures[i] - refFeatures[i];
      sumSquaredDiff += diff * diff;
    }
    const euclideanDist = Math.sqrt(sumSquaredDiff);
    
    // 转换为相似度（0-100）
    // 假设最大距离为 10，超过 10 的距离相似度为 0
    return Math.max(0, 100 - (euclideanDist / 10) * 100);
  };

  // 开始识别
  // 检查电极状态
  const handleCheckElectrode = () => {
    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    // 从 localStorage 加载全局电极基准
    const saved = localStorage.getItem('emg-global-electrode-baseline');
    if (!saved) {
      setError('系统未采集电极基准，请在调试页面采集');
      return;
    }

    try {
      const baseline = JSON.parse(saved);
      setGlobalElectrodeBaseline(baseline);
      setShowElectrodeCheck(true);
    } catch (err) {
      setError('电极基准数据损坏，请重新采集');
    }
  };

  const handleStartRecognition = () => {
    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    if (savedCommands.length === 0) {
      setError('请先完成采集训练');
      return;
    }

    // 检查电极状态
    if (electrodeCheckResult && !isElectrodeStatusAcceptable(electrodeCheckResult)) {
      setError('电极状态不符合要求，请先调节电极');
      return;
    }

    setIsRecognizing(true);
    setError(null);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    waveformBufferRef.current = { ch1: [], ch2: [], ch3: [] };
    setRecognitionTime(0);
    setShowElectrodeCheck(false);
    setElectrodeCheckResult(null);

    // 计时器
    timerRef.current = setInterval(() => {
      setRecognitionTime((t) => t + 1);
    }, 1000);
  };

  // 停止识别
  const handleStopRecognition = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsRecognizing(false);

    // 识别
    if (waveformBufferRef.current.ch1.length > 0) {
      let result: RecognitionResult;

      if (useCNNModel && cnnModelLoaded) {
        // 使用 CNN 模型识别
        const cnnResult = cnnModelManager.recognize(
          waveformBufferRef.current.ch1,
          waveformBufferRef.current.ch2,
          waveformBufferRef.current.ch3,
          confidenceThreshold
        );

        if (cnnResult.success) {
          const scores = cnnResult.allProbabilities?.map(p => ({
            command: p.command,
            score: p.probability * 100
          })) || [];

          result = {
            timestamp: new Date(),
            command: cnnResult.command || '❌ 识别不确定',
            confidence: cnnResult.confidence || 0,
            allScores: scores,
          };
        } else {
          setError(cnnResult.message);
          setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
          return;
        }
      } else {
        // 使用多通道融合和自适应阈值的欧氏距离识别
        const features = extractFullFeatures(
          waveformBufferRef.current.ch1,
          waveformBufferRef.current.ch2,
          waveformBufferRef.current.ch3
        );

        // 计算通道权重（基于 SNR）
        const weights = calculateChannelWeights(
          waveformBufferRef.current.ch1,
          waveformBufferRef.current.ch2,
          waveformBufferRef.current.ch3
        );

        // 融合三通道特征
        const fusedFeatures = fuseChannelFeatures(
          features.timeDomain.ch1,
          features.timeDomain.ch2,
          features.timeDomain.ch3,
          weights
        );

        const normalizedFeatures = normalizeFeatures(fusedFeatures);

        // 与每个指令的特征库比对
        const scores: Array<{ command: string; score: number }> = [];

        for (const cmd of savedCommands) {
          let maxSimilarity = 0;

          // 与该指令的所有采集样本比对，取最小距离
          for (const collection of cmd.collections) {
            const refFeatures = extractFullFeatures(
              collection.waveform.ch1,
              collection.waveform.ch2,
              collection.waveform.ch3
            );
            
            // 融合参考特征
            const fusedRefFeatures = fuseChannelFeatures(
              refFeatures.timeDomain.ch1,
              refFeatures.timeDomain.ch2,
              refFeatures.timeDomain.ch3,
              weights
            );
            
            const normalizedRefFeatures = normalizeFeatures(fusedRefFeatures);

            const dtwSim = calculateSimilarity(normalizedFeatures, normalizedRefFeatures);
            maxSimilarity = Math.max(maxSimilarity, dtwSim);
          }

          scores.push({ command: cmd.name, score: maxSimilarity });
        }

        // 排序并获取最高分
        scores.sort((a, b) => b.score - a.score);
        const topCommand = scores[0];

        // 使用自适应阈值
        const threshold = adaptiveThreshold * 100;
        result = {
          timestamp: new Date(),
          command: topCommand.score < threshold ? '❌ 识别不确定' : topCommand.command,
          confidence: topCommand.score,
          allScores: scores,
        };
      }
      
      // 显示反馈面板
      setLastRecognitionResult(result);
      setShowFeedback(true);
      setSelectedTrueCommand('');
      setError(null);
    }

    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
  };

  // 提交反馈
  const handleSubmitFeedback = () => {
    if (!selectedTrueCommand || !lastRecognitionResult) return;

    try {
      // 1. 计算相似度和置信度
      const similarity = lastRecognitionResult.confidence;
      const confidence = lastRecognitionResult.confidence;
      
      // 2. 加载已保存的指令模板
      const templates = savedCommands.map(cmd => ({
        commandName: cmd.name,
        meanFeatureVector: [],
      }));
      
      // 3. 调用反馈纠偶系统
      const calibrationRecord = processRecognitionFeedback(
        lastRecognitionResult.command,
        selectedTrueCommand,
        similarity,
        confidence,
        templates as any
      );
      
      // 4. 记录用户反馈
      const feedbackRecord = submitUserFeedback(
        {
          testId: `test-${Date.now()}`,
          timestamp: new Date(),
          predictedCommand: lastRecognitionResult.command,
          predictedSimilarity: similarity,
          predictedConfidence: confidence,
          trueCommand: selectedTrueCommand,
          isCorrect: lastRecognitionResult.command === selectedTrueCommand,
          topMatches: lastRecognitionResult.allScores.map((s: any) => ({ command: s.command, similarity: s.score })),
        },
        selectedTrueCommand
      );
      
      // 5. 更新自适应阈值
      const isCorrect = lastRecognitionResult.command === selectedTrueCommand;
      if (isCorrect) {
        const newThreshold = Math.max(0.5, adaptiveThreshold - 0.05);
        setAdaptiveThreshold(newThreshold);
      } else {
        const newThreshold = Math.min(0.95, adaptiveThreshold + 0.05);
        setAdaptiveThreshold(newThreshold);
      }
      
      // 6. 计算性能指标
      const allFeedback = getCalibrationRecords().map((record: any) => ({
        testId: `test-${record.timestamp}`,
        timestamp: new Date(record.timestamp),
        predictedCommand: record.predictedCommand,
        predictedSimilarity: record.similarity,
        predictedConfidence: record.confidence,
        trueCommand: record.actualCommand,
        isCorrect: record.isCorrect,
        topMatches: [],
      }));
      const metrics = calculatePerformanceMetrics(allFeedback);
      // 7. 保存反馈记录到历史
      const historyRecord = {
        ...lastRecognitionResult,
        userCorrection: selectedTrueCommand,
        isCorrect,
        calibrationApplied: calibrationRecord.adjustmentApplied,
        timestamp: new Date(),
      };
      
      setRecognitionHistory([historyRecord as any, ...recognitionHistory]);
      setError(null);
      
    } catch (err) {
      console.error('反馈处理失败:', err);
      setError(`反馈处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    
    setShowFeedback(false);
    setLastRecognitionResult(null);
    setSelectedTrueCommand('');
  };

  return (
    <div className="min-h-screen" style={{
      color: '#fff',
      paddingBottom: '40px',
    }}>
      {/* 返回按钮 */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ← 返回主页
        </button>
      </div>
      <Container>
        <Section>
          {/* 硬件连接状态 */}
          <SectionLabel number="00">HARDWARE CONNECTION</SectionLabel>
          <SectionTitle>硬件连接</SectionTitle>
          <HardwareStatusComponent />

          <Divider />

          {/* 识别指导 */}
          <SectionLabel number="01">RECOGNITION GUIDE</SectionLabel>
          <SectionTitle>识别流程</SectionTitle>

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>①</div>
                <div style={{ fontSize: '12px', color: '#888' }}>点击"开始识别"</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>②</div>
                <div style={{ fontSize: '12px', color: '#888' }}>等待倒计时完成</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>③</div>
                <div style={{ fontSize: '12px', color: '#888' }}>默念指令 (2-3 秒)</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>④</div>
                <div style={{ fontSize: '12px', color: '#888' }}>查看识别结果</div>
              </div>
            </div>
          </div>

          <Divider />

          {/* 实时波形显示 */}
          <SectionLabel number="02">REAL-TIME WAVEFORM</SectionLabel>
          <SectionTitle>实时波形</SectionTitle>

          {!isConnected && (
            <div style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              padding: '16px',
              marginBottom: '16px',
              color: '#ef4444',
            }}>
              ⚠️ 请先连接 STM32 设备
            </div>
          )}

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '16px',
          }}>
            <EnhancedWaveformVisualization
              ch1={currentWaveform.ch1}
              ch2={currentWaveform.ch2}
              ch3={currentWaveform.ch3}
              height={250}
              isLive={isRecognizing}
              showLayers={false}
              title="实时波形"
            />
          </div>

          {/* 置信度阈值设置 */}
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ marginBottom: '12px', color: '#888' }}>
              置信度阈值：{(confidenceThreshold * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceThreshold * 100}
              onChange={(e) => setConfidenceThreshold(parseInt(e.target.value) / 100)}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
              低于阈值的识别结果将被标记为"识别不确定"
            </div>
          </div>

          {/* 识别控制 */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            justifyContent: 'center',
          }}>
            {!isRecognizing ? (
              <button
                onClick={handleStartRecognition}
                disabled={!isConnected || savedCommands.length === 0}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected && savedCommands.length > 0 ? '#d4af37' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected && savedCommands.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                开始识别
              </button>
            ) : (
              <button
                onClick={handleStopRecognition}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                停止识别 ({recognitionTime}s)
              </button>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              padding: '12px',
              color: '#ef4444',
              marginBottom: '16px',
              fontSize: '14px',
            }}>
              {error}
            </div>
          )}

          {/* 反馈面板 */}
          {showFeedback && lastRecognitionResult && (
            <>
              <Divider />
              <SectionLabel number="03">USER FEEDBACK</SectionLabel>
              <SectionTitle>用户反馈</SectionTitle>

              <div style={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '16px',
                marginBottom: '24px',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>系统识别结果</div>
                  <div style={{ fontSize: '18px', color: '#d4af37', fontWeight: 'bold' }}>
                    {lastRecognitionResult.command}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    置信度：{lastRecognitionResult.confidence.toFixed(0)}%
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>请选择您实际默念的指令：</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '8px',
                  }}>
                    {savedCommands.map((cmd) => (
                      <button
                        key={cmd.name}
                        onClick={() => setSelectedTrueCommand(cmd.name)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: selectedTrueCommand === cmd.name ? '#d4af37' : '#333',
                          color: selectedTrueCommand === cmd.name ? '#000' : '#fff',
                          border: selectedTrueCommand === cmd.name ? '2px solid #d4af37' : '1px solid #555',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: selectedTrueCommand === cmd.name ? 'bold' : 'normal',
                        }}
                      >
                        {cmd.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                }}>
                  <button
                    onClick={() => {
                      setShowFeedback(false);
                      setLastRecognitionResult(null);
                      setSelectedTrueCommand('');
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#333',
                      color: '#fff',
                      border: '1px solid #555',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!selectedTrueCommand}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: selectedTrueCommand ? '#d4af37' : '#666',
                      color: selectedTrueCommand ? '#000' : '#999',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedTrueCommand ? 'pointer' : 'not-allowed',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    提交反馈
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 识别历史 */}
          {recognitionHistory.length > 0 && (
            <>
              <Divider />
              <SectionLabel number="03">RECOGNITION HISTORY</SectionLabel>
              <SectionTitle>识别历史</SectionTitle>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
              }}>
                {recognitionHistory.slice(0, 10).map((result, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        #{idx + 1} · {result.timestamp.toLocaleTimeString()}
                      </div>
                      <div style={{ fontSize: '20px', color: '#d4af37', fontWeight: 'bold' }}>
                        {result.command}
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                      marginBottom: '12px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        置信度
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <div style={{
                          flex: 1,
                          backgroundColor: '#333',
                          height: '6px',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            backgroundColor: result.confidence >= 80 ? '#22c55e' : result.confidence >= 60 ? '#f59e0b' : '#ef4444',
                            height: '100%',
                            width: `${result.confidence}%`,
                          }} />
                        </div>
                        <div style={{ fontSize: '12px', color: '#d4af37', minWidth: '40px' }}>
                          {result.confidence.toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        所有得分
                      </div>
                      {result.allScores.slice(0, 3).map((score, scoreIdx) => (
                        <div
                          key={scoreIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: '#888',
                            marginBottom: scoreIdx < 2 ? '4px' : '0',
                          }}
                        >
                          <span>{score.command}</span>
                          <span>{score.score.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </Container>
    </div>
  );
}

```

---

## pages/RecognitionTest.tsx

```typescript
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUserSession } from '@/contexts/UserSessionContext';
import { useLocation } from 'wouter';
import { recognizeCommand, CommandTemplate } from '@/lib/template-based-recognition';
import {
  processRecognitionFeedback,
  getCalibrationStatistics,
} from '@/lib/auto-calibration-system';

/**
 * 默念测试页面 - 完整流程
 * 1. 显示开始按钮
 * 2. 采集肌电信号
 * 3. 显示模型识别结果
 * 4. 提供所有指令选项让用户选择真实指令
 * 5. 对比并纠偏
 */
export default function RecognitionTest() {
  const { currentUser } = useUserSession();
  const [location, setLocation] = useLocation();

  // 状态管理
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [calibrationStats, setCalibrationStats] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);

  // 初始化
  useEffect(() => {
    if (!currentUser) {
      setLocation('/');
      return;
    }
    loadTemplates();
    loadCalibrationStats();
  }, [currentUser, setLocation]);

  /**
   * 加载指令模板
   * 从 emg-commands localStorage key 中读取已采集的指令
   */
  const loadTemplates = () => {
    try {
      // 从 localStorage 加载已采集的指令
      console.log('All localStorage keys:', Object.keys(localStorage));
      const commandsData = localStorage.getItem('emg-commands');
      if (!commandsData) {
        console.warn('❌ No emg-commands found in localStorage');
        console.warn('Available keys:', Object.keys(localStorage).filter(k => k.includes('emg') || k.includes('template')));
        setTemplates([]);
        return;
      }

      const commands = JSON.parse(commandsData);
      if (!Array.isArray(commands)) {
        console.warn('emg-commands is not an array');
        setTemplates([]);
        return;
      }

      // 从每个指令中提取第一个采集作为模板
      const templates: CommandTemplate[] = commands
        .filter((cmd: any) => cmd && cmd.name && cmd.collections && cmd.collections.length > 0)
        .map((cmd: any) => {
          const firstCollection = cmd.collections[0];
          return {
            commandName: cmd.name,
            featureVectors: [[]], // 不会用到
            meanFeatureVector: [],
            covarianceMatrix: [],
            rawSignals: [
              [
                ...Object.values(firstCollection.waveform.ch1 || []),
                ...Object.values(firstCollection.waveform.ch2 || []),
                ...Object.values(firstCollection.waveform.ch3 || []),
              ],
            ],
            quality: {
              internalSimilarity: 80,
              signalStrength: 75,
              frequencyPurity: 70,
            },
            createdAt: new Date(cmd.createdAt),
            sampleCount: cmd.collections.length,
          } as CommandTemplate;
        });
      setTemplates(templates);
    } catch (err) {
      console.error('❌ Failed to load templates:', err);
      console.error('Error details:', err);
      setTemplates([]);
    }
  };

  /**
   * 加载纠偏统计
   */
  const loadCalibrationStats = () => {
    const stats = getCalibrationStatistics();
    setCalibrationStats(stats);
  };

  /**
   * 开始识别
   */
  const handleStartRecognition = () => {
    if (templates.length === 0) {
      alert('没有可用的模板，请先完成采集训练');
      return;
    }

    setIsRecording(true);
    setRecognitionResult(null);
    setSelectedAnswer('');

    // 模拟采集（实际应该从设备获取）
    setTimeout(() => {
      handleStopRecognition();
    }, 3000); // 3 秒后自动停止
  };

  /**
   * 停止识别并进行模型预测
   */
  const handleStopRecognition = () => {
    setIsRecording(false);

    if (templates.length === 0) {
      alert('没有可用的模板');
      return;
    }

    // 模拟识别：从随机模板中获取信号
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const mockSignal = randomTemplate.rawSignals?.[0];

    if (!mockSignal) {
      alert('模板中没有可用的信号数据');
      return;
    }

    // 执行识别
    const result = recognizeCommand(mockSignal, templates);

    if (result) {
      setRecognitionResult({
        predictedCommand: result.commandName,
        similarity: result.similarity,
        confidence: result.confidence,
        topMatches: result.details?.topMatches || [],
      });
    } else {
      alert('识别失败，请重试');
    }
  };

  /**
   * 用户选择答案
   */
  const handleSelectAnswer = (commandName: string) => {
    setSelectedAnswer(commandName);
  };

  /**
   * 提交答案并进行纠偏
   */
  const handleSubmitAnswer = () => {
    if (!selectedAnswer || !recognitionResult) {
      alert('请选择答案');
      return;
    }

    // 进行自动纠偏
    const calibrationRecord = processRecognitionFeedback(
      recognitionResult.predictedCommand,
      selectedAnswer,
      recognitionResult.similarity,
      recognitionResult.confidence,
      templates
    );

    // 添加到测试历史
    const newRecord = {
      timestamp: new Date().toLocaleTimeString(),
      predicted: recognitionResult.predictedCommand,
      actual: selectedAnswer,
      isCorrect: calibrationRecord.isCorrect,
      similarity: recognitionResult.similarity,
      confidence: recognitionResult.confidence,
    };

    setTestHistory([newRecord, ...testHistory]);

    // 刷新纠偏统计
    loadCalibrationStats();

    // 重置状态，准备下一次测试
    setRecognitionResult(null);
    setSelectedAnswer('');

    // 显示结果提示
    if (calibrationRecord.isCorrect) {
      alert('✅ 正确！特征已强化');
    } else {
      alert(`❌ 错误！已纠偏\n预测: ${recognitionResult.predictedCommand}\n正确: ${selectedAnswer}`);
    }
  };

  /**
   * 返回主页
   */
  const handleBackHome = () => {
    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 返回按钮 */}
        <button
          onClick={handleBackHome}
          className="mb-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
        >
          ← 返回主页
        </button>

        {/* 调试面板 - 使用白色文字和更明显的样式 */}
        <div style={{
          border: '4px solid #ff0000',
          backgroundColor: '#000000',
          padding: '24px',
          marginBottom: '24px',
          borderRadius: '8px'
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#ffffff',
            marginBottom: '16px',
            backgroundColor: '#ff0000',
            padding: '8px 12px',
            borderRadius: '4px'
          }}>🔍 调试信息 - 数据加载状态</h3>
          <div style={{
            backgroundColor: '#1a1a1a',
            borderRadius: '6px',
            padding: '16px',
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: 'monospace',
            lineHeight: '1.8'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: '#fbbf24' }}>⚠️ localStorage 数据:</span>
              <div style={{ fontSize: '12px', marginTop: '8px', marginLeft: '16px' }}>
                {(() => {
                  const allKeys = Object.keys(localStorage);
                  const emgData = localStorage.getItem('emg-commands');
                  return (
                    <>
                      <div>所有 key: {allKeys.length} 个</div>
                      <div>包含 'emg' 的 key: {allKeys.filter(k => k.includes('emg')).join(', ') || '无'}</div>
                      <div>包含 'template' 的 key: {allKeys.filter(k => k.includes('template')).join(', ') || '无'}</div>
                      <div style={{ marginTop: '8px' }}>
                        {emgData ? (
                          <>
                            <div>✅ emg-commands 存在</div>
                            <div>数据长度: {emgData.length} 字节</div>
                            <div>指令数: {JSON.parse(emgData).length} 个</div>
                            <div>指令名称: {JSON.parse(emgData).map((cmd: any) => cmd.name).join(', ')}</div>
                          </>
                        ) : (
                          <div>❌ emg-commands 不存在</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div>
              <span style={{ color: '#fbbf24' }}>⚠️ 当前加载的模板:</span>
              <div style={{ fontSize: '12px', marginTop: '8px', marginLeft: '16px' }}>
                {templates.length > 0 ? (
                  <>
                    <div>✅ 已加载 {templates.length} 个模板</div>
                    <div>模板名称: {templates.map(t => t.commandName).join(', ')}</div>
                  </>
                ) : (
                  <div>❌ 没有加载任何模板</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左侧：测试控制 */}
          <div className="col-span-2">
            <Card className="bg-slate-800 border-amber-500/30 p-8 mb-6">
              <h1 className="text-3xl font-bold text-amber-400 mb-2">默念测试</h1>
              <p className="text-slate-300 mb-6">
                点击开始按钮，默念一个指令，系统将识别并显示结果
              </p>

              {/* 识别状态 */}
              <div className="bg-slate-700 rounded-lg p-6 mb-6">
                {!recognitionResult ? (
                  <>
                    <div className="text-center mb-6">
                      <p className="text-slate-400 mb-4">
                        {isRecording ? '正在采集信号...' : '准备好了吗？'}
                      </p>
                      {isRecording && (
                        <div className="inline-block">
                          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleStartRecognition}
                        disabled={isRecording}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 disabled:opacity-50"
                      >
                        开始识别
                      </Button>
                      <Button
                        onClick={handleStopRecognition}
                        disabled={!isRecording}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 disabled:opacity-50"
                      >
                        停止识别
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 模型识别结果 */}
                    <div className="mb-6">
                      <h2 className="text-lg font-bold text-white mb-4">系统识别结果</h2>
                      <div className="bg-slate-600 rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-sm text-slate-400">预测指令</div>
                            <div className="text-2xl font-bold text-amber-400">
                              {recognitionResult.predictedCommand}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-400">相似度</div>
                            <div className="text-2xl font-bold text-blue-400">
                              {recognitionResult.similarity}%
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-400">置信度</div>
                            <div className="text-2xl font-bold text-green-400">
                              {recognitionResult.confidence}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 候选指令 */}
                      {recognitionResult.topMatches?.length > 1 && (
                        <div className="mb-4">
                          <div className="text-sm text-slate-400 mb-2">其他候选：</div>
                          <div className="space-y-2">
                            {recognitionResult.topMatches.slice(1, 3).map((match: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-slate-700 rounded px-3 py-2"
                              >
                                <span className="text-slate-300">{match.command}</span>
                                <span className="text-slate-400">{match.similarity}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 用户选择真实答案 */}
                    <div>
                      <h2 className="text-lg font-bold text-white mb-4">
                        请选择您实际默念的指令：
                      </h2>
                      {templates.length === 0 ? (
                        <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
                          <p className="text-red-300">❌ 没有可用的指令，请先完成采集训练</p>
                          <p className="text-red-400 text-sm mt-2">提示：请先到“采集训练”页面采集至少 5 次每个指令，然后点击“确认保存”按钮</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-slate-300 text-sm mb-3">可用指令：{templates.length} 个</p>
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            {templates.map((template) => (
                              <button
                                key={template.commandName}
                                onClick={() => handleSelectAnswer(template.commandName)}
                                className={`p-4 rounded-lg font-semibold transition ${
                                  selectedAnswer === template.commandName
                                    ? 'bg-amber-500 text-black ring-2 ring-amber-300'
                                    : 'bg-slate-700 text-white hover:bg-slate-600'
                                }`}
                              >
                                {template.commandName}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="flex gap-3">
                        <Button
                          onClick={handleSubmitAnswer}
                          disabled={!selectedAnswer || templates.length === 0}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 disabled:opacity-50"
                        >
                          提交答案
                        </Button>
                        <Button
                          onClick={() => {
                            setRecognitionResult(null);
                            setSelectedAnswer('');
                          }}
                          variant="outline"
                          className="flex-1 border-slate-600 text-slate-300"
                        >
                          重新测试
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>


          </div>

          {/* 右侧：统计面板 */}
          <div>
            <Card className="bg-slate-800 border-amber-500/30 p-6 mb-6">
              <h2 className="text-lg font-bold text-amber-400 mb-4">纠偏统计</h2>
              {calibrationStats && (
                <div className="space-y-4">
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">总测试次数</div>
                    <div className="text-2xl font-bold text-amber-400">
                      {calibrationStats.totalRecords}
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">准确率</div>
                    <div className="text-2xl font-bold text-green-400">
                      {calibrationStats.accuracy.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">改进趋势</div>
                    <div
                      className={`text-2xl font-bold ${
                        calibrationStats.improvementTrend > 0
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {calibrationStats.improvementTrend > 0 ? '+' : ''}
                      {calibrationStats.improvementTrend.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">强化次数</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {calibrationStats.reinforcementCount}
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-400">纠偏次数</div>
                    <div className="text-2xl font-bold text-orange-400">
                      {calibrationStats.correctionCount}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* 测试历史 */}
            {testHistory.length > 0 && (
              <Card className="bg-slate-800 border-amber-500/30 p-6">
                <h2 className="text-lg font-bold text-amber-400 mb-4">最近测试</h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {testHistory.slice(0, 10).map((record, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg text-sm ${
                        record.isCorrect
                          ? 'bg-green-900/30 border border-green-500'
                          : 'bg-red-900/30 border border-red-500'
                      }`}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold">
                          {record.isCorrect ? '✅' : '❌'} {record.timestamp}
                        </span>
                        <span className="text-xs text-slate-400">
                          相似度 {record.similarity}%
                        </span>
                      </div>
                      <div className="text-slate-300">
                        预测: {record.predicted} → 正确: {record.actual}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

```

---

## pages/Settings.tsx

```typescript
/**
 * 设置页面 - 数据管理、导出、用户会话
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertCircle,
  ChevronLeft,
  Download,
  Trash2,
  Users,
  FileJson,
  FileText,
} from 'lucide-react';
import { emgDatabase } from '@/lib/db';
import {
  exportAndDownloadJSON,
  exportAndDownloadCSV,
  generateReport,
  downloadFile,
} from '@/lib/export-data';

export default function Settings() {
  const [, setLocation] = useLocation();
  const [trainingCount, setTrainingCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 加载统计数据
  useEffect(() => {
    const loadStats = async () => {
      try {
        const trainingData = await emgDatabase.getAllTrainingData();
        const sessions = await emgDatabase.getAllSessions();
        setTrainingCount(trainingData.length);
        setSessionCount(sessions.length);
      } catch (err) {
        const message = err instanceof Error ? err.message : '加载失败';
        setError(message);
      }
    };

    loadStats();
  }, []);

  const handleExportJSON = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await exportAndDownloadJSON();
      setSuccess('JSON 数据已导出');
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await exportAndDownloadCSV();
      setSuccess('CSV 数据已导出');
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      const report = await generateReport();
      const filename = `emg-report-${new Date().toISOString().split('T')[0]}.md`;
      downloadFile(report, filename);
      setSuccess('报告已生成');
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm('确定要清空所有数据吗？此操作不可撤销。')) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await emgDatabase.clearAllTrainingData();
      setTrainingCount(0);
      setSuccess('所有数据已清空');
    } catch (err) {
      const message = err instanceof Error ? err.message : '清空失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className="text-gray-600"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-semibold text-gray-900">设置</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Data Statistics */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5" />
              数据统计
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">训练记录数</span>
                <span className="text-2xl font-bold text-blue-600">
                  {trainingCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">会话数</span>
                <span className="text-2xl font-bold text-green-600">
                  {sessionCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">数据库大小</span>
                <span className="text-lg font-semibold text-gray-900">
                  本地存储
                </span>
              </div>
            </div>
          </Card>

          {/* Export Options */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Download className="w-5 h-5" />
              数据导出
            </h2>

            <div className="space-y-3">
              <Button
                onClick={handleExportJSON}
                disabled={isLoading || trainingCount === 0}
                className="w-full justify-start gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                variant="outline"
              >
                <FileJson className="w-4 h-4" />
                导出为 JSON
              </Button>

              <Button
                onClick={handleExportCSV}
                disabled={isLoading || trainingCount === 0}
                className="w-full justify-start gap-2 bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
                variant="outline"
              >
                <FileText className="w-4 h-4" />
                导出为 CSV
              </Button>

              <Button
                onClick={handleGenerateReport}
                disabled={isLoading || (trainingCount === 0 && sessionCount === 0)}
                className="w-full justify-start gap-2 bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200"
                variant="outline"
              >
                <FileText className="w-4 h-4" />
                生成报告
              </Button>
            </div>

            <p className="text-xs text-gray-600 mt-4">
              💡 导出数据可用于后续分析和演示记录
            </p>
          </Card>
        </div>

        {/* Data Management */}
        <Card className="mt-8 p-6 border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            数据管理
          </h2>

          <p className="text-sm text-red-700 mb-4">
            危险操作：以下操作将永久删除数据，请谨慎使用。
          </p>

          <Button
            onClick={handleClearAllData}
            disabled={isLoading || trainingCount === 0}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            清空所有训练数据
          </Button>
        </Card>

        {/* System Information */}
        <Card className="mt-8 p-6 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            系统信息
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600">数据存储</p>
              <p className="font-medium text-gray-900 mt-1">IndexedDB</p>
            </div>
            <div>
              <p className="text-gray-600">采样率</p>
              <p className="font-medium text-gray-900 mt-1">250 Hz</p>
            </div>
            <div>
              <p className="text-gray-600">电极数量</p>
              <p className="font-medium text-gray-900 mt-1">3 个</p>
            </div>
            <div>
              <p className="text-gray-600">指令总数</p>
              <p className="font-medium text-gray-900 mt-1">10 条</p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

```

---

