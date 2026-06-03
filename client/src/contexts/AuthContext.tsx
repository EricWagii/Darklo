/**
 * 认证上下文 - 管理采集和数据管理页面的登录状态
 * 
 * 功能：
 * - 密码认证
 * - 会话管理
 * - 登录状态（内存存储，刷新后需要重新登录）
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 从环境变量读取管理员密码，避免硬编码
const CORRECT_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'geniusatwork';

if (import.meta.env.VITE_ADMIN_PASSWORD === undefined) {
  console.log('ℹ️ 使用默认管理员密码。建议在环境变量中配置 VITE_ADMIN_PASSWORD');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const login = (password: string): boolean => {
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
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
