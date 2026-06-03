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
