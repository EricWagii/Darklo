/**
 * 受保护的路由组件
 * 确保只有已登录的用户才能访问受保护的页面
 */

import React from 'react';
import { useUserSession } from '@/contexts/UserSessionContext';
import { useLocation } from 'wouter';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredAdmin?: boolean;
}

export function ProtectedRoute({ children, requiredAdmin = false }: ProtectedRouteProps) {
  const { isLoggedIn, currentUser, isInitialized } = useUserSession();
  const [, navigate] = useLocation();

  // 等待初始化完成
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="text-xl text-gray-400 mb-4">验证身份中...</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  // 未登录，重定向到首页
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div style={{
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #d4af37',
          borderRadius: '8px',
        }}>
          <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>访问受限</h2>
          <p style={{ color: '#888', marginBottom: '20px' }}>
            您需要登录才能访问此页面
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#d4af37',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
            }}
          >
            返回首页登录
          </button>
        </div>
      </div>
    );
  }

  // 需要管理员权限但用户不是管理员
  if (requiredAdmin && !currentUser?.isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div style={{
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #d4af37',
          borderRadius: '8px',
        }}>
          <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>权限不足</h2>
          <p style={{ color: '#888', marginBottom: '20px' }}>
            您没有访问此页面的权限
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#d4af37',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // 用户已登录且有权限，显示页面内容
  return <>{children}</>;
}
