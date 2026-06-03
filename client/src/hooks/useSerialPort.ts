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
