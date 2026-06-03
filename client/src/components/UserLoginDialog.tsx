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
