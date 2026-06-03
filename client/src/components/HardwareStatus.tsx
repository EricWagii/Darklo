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
