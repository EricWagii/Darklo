/**
 * 用户管理上下文
 * 
 * 功能：
 * - 用户创建和切换
 * - 用户特征库管理
 * - 用户电极基准管理
 * - 使用IndexedDB存储用户数据
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { emgDatabase } from '@/lib/db';

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

  // 从 IndexedDB 加载用户数据
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await emgDatabase.getAllUserAccounts();
        if (users && users.length > 0) {
          setAllUsers(users);
          // 恢复当前用户（使用最后使用的用户）
          const lastUsed = users.reduce((prev, curr) => 
            new Date(curr.lastUsed) > new Date(prev.lastUsed) ? curr : prev
          );
          setCurrentUser(lastUsed);
        }
      } catch (err) {
        console.error('加载用户数据失败:', err);
      }
    };

    loadUsers();
  }, []);

  // 保存用户数据到 IndexedDB
  const saveUsers = async (users: UserProfile[]) => {
    try {
      for (const user of users) {
        await emgDatabase.saveUserAccount(user);
      }
    } catch (err) {
      console.error('保存用户数据失败:', err);
    }
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
    // ✅ 新发现6修复：新建用户后直接setCurrentUser，不依赖switchUser中的state查找
    setCurrentUser(newUser);

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
