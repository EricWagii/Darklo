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
