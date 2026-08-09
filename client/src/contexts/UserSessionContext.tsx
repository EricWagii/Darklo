/**
 * 用户会话管理上下文
 * 
 * 功能：
 * - 管理当前登录用户
 * - 存储用户会话信息
 * - 提供用户登录/登出/注册功能
 * - 集成审计日志记录
 * - 使用服务器端tRPC认证API
 * 
 * 安全设计：
 * - 页面加载时不自动恢复会话（防止旧cookie被利用）
 * - 用户必须主动登录
 * - 会话cookie设置7天过期时间
 * - 登出时清除所有本地状态
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';
import { isPortableRuntime, portableAccountToSession } from '@/lib/portable-runtime';

export interface UserSession {
  userId: number;
  userName: string;
  isAdmin: boolean;
  loginTime: Date;
}

interface UserSessionContextType {
  currentUser: UserSession | null;
  isLoggedIn: boolean;
  isInitialized: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(undefined);

function PortableUserSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setCurrentUser(null);
    setIsInitialized(true);
    console.log('[便携模式] 使用浏览器本地账户，页面加载时要求主动登录');
  }, []);

  const login = async (username: string, password: string) => {
    const { loginUser } = await import('@/lib/user-auth');
    const result = await loginUser(username, password);
    if (!result.success || !result.account) {
      return { success: false, message: result.message };
    }

    const session = portableAccountToSession(result.account);
    setCurrentUser(session);
    logAuditEvent(
      AuditEventType.USER_LOGIN,
      { username, runtime: 'portable' },
      session.userId.toString(),
      session.userName
    );

    return { success: true, message: result.message };
  };

  const register = async (username: string, password: string) => {
    const { registerUser } = await import('@/lib/user-auth');
    const result = await registerUser(username, password);
    if (result.success && result.userId) {
      logAuditEvent(
        AuditEventType.USER_REGISTER,
        { username, runtime: 'portable' },
        result.userId,
        username
      );
    }
    return { success: result.success, message: result.message };
  };

  const logout = async () => {
    if (currentUser) {
      logAuditEvent(
        AuditEventType.USER_LOGOUT,
        { runtime: 'portable' },
        currentUser.userId.toString(),
        currentUser.userName
      );
    }
    setCurrentUser(null);
  };

  return (
    <UserSessionContext.Provider
      value={{
        currentUser,
        isLoggedIn: !!currentUser,
        isInitialized,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserSessionContext.Provider>
  );
}

function ServerUserSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // tRPC hooks
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: false, // Don't auto-fetch
  });
  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  /**
   * 安全初始化：不自动恢复会话
   * 
   * 原因：
   * - 防止旧的会话cookie被自动利用
   * - 即使用户的cookie仍然有效，也要求用户主动登录
   * - 这样可以防止在共享设备上的安全问题
   * 
   * 用户必须主动登录才能访问受保护的页面
   */
  useEffect(() => {
    // 清除内存中的状态
    setCurrentUser(null);
    
    console.log('[安全初始化] 页面加载时不自动恢复会话，用户需要主动登录');
    setIsInitialized(true);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const result = await loginMutation.mutateAsync({ username, password });
      
      if (result.success && result.user) {
        const user: UserSession = {
          userId: result.user.id,
          userName: result.user.username || username,
          isAdmin: result.user.role === 'admin',
          loginTime: new Date(),
        };
        setCurrentUser(user);
        

        
        // 记录登录事件
        logAuditEvent(
          AuditEventType.USER_LOGIN,
          { username },
          result.user.id.toString(),
          result.user.username || username
        );
        
        console.log('[Auth] 登录成功:', username);
        
        return {
          success: true,
          message: '登录成功',
        };
      }
      
      return {
        success: false,
        message: '登录失败',
      };
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      const message = error?.message || '登录失败，请重试';
      return {
        success: false,
        message,
      };
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const result = await registerMutation.mutateAsync({ username, password });
      
      if (result.success && result.user) {
        // 记录注册事件
        logAuditEvent(
          AuditEventType.USER_REGISTER,
          { username },
          result.user.id.toString(),
          result.user.username || username
        );
        
        console.log('[Auth] 注册成功:', username);
        
        return {
          success: true,
          message: '注册成功',
        };
      }
      
      return {
        success: false,
        message: '注册失败',
      };
    } catch (error: any) {
      console.error('[Auth] Register error:', error);
      const message = error?.message || '注册失败，请重试';
      return {
        success: false,
        message,
      };
    }
  };

  const logout = async () => {
    try {
      if (currentUser) {
        // 记录登出事件
        logAuditEvent(
          AuditEventType.USER_LOGOUT,
          {},
          currentUser.userId.toString(),
          currentUser.userName
        );
      }
      
      // 调用服务器登出API
      await logoutMutation.mutateAsync();
      
      // 清除本地状态
      setCurrentUser(null);
      console.log('[Auth] 已登出');
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      // 即使服务器调用失败，也清除本地状态
      setCurrentUser(null);
    }
  };

  return (
    <UserSessionContext.Provider
      value={{
        currentUser,
        isLoggedIn: !!currentUser,
        isInitialized,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserSessionContext.Provider>
  );
}

export function UserSessionProvider({ children }: { children: React.ReactNode }) {
  if (isPortableRuntime()) {
    return <PortableUserSessionProvider>{children}</PortableUserSessionProvider>;
  }

  return <ServerUserSessionProvider>{children}</ServerUserSessionProvider>;
}

export function useUserSession() {
  const context = useContext(UserSessionContext);
  if (context === undefined) {
    throw new Error('useUserSession must be used within UserSessionProvider');
  }
  return context;
}
