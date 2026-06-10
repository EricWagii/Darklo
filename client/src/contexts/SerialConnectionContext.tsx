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
  onDataReceived: (callback: (data: SerialData) => void) => () => void;
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
