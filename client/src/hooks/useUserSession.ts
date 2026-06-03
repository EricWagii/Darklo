/**
 * React Hook - 用户会话管理
 */

import { useState, useCallback } from 'react';
import { emgDatabase } from '@/lib/db';

export interface UserSession {
  id?: number;
  userId: string;
  userName: string;
  startTime: number;
  endTime?: number;
  trainingCount: number;
  recognitionCount: number;
  recognitionAccuracy?: number;
  notes?: string;
}

export interface UseUserSessionReturn {
  currentSession: UserSession | null;
  sessions: UserSession[];
  error: string | null;
  startSession: (userId: string, userName: string) => Promise<void>;
  endSession: () => Promise<void>;
  updateSessionStats: (
    trainingCount: number,
    recognitionCount: number,
    accuracy?: number
  ) => Promise<void>;
  loadSessions: () => Promise<void>;
  deleteSession: (id: number) => Promise<void>;
}

export function useUserSession(): UseUserSessionReturn {
  const [currentSession, setCurrentSession] = useState<UserSession | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(
    async (userId: string, userName: string) => {
      try {
        setError(null);

        const session: UserSession = {
          userId,
          userName,
          startTime: Date.now(),
          trainingCount: 0,
          recognitionCount: 0,
        };

        const id = await emgDatabase.saveSession(session);
        session.id = id as any;
        setCurrentSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : '会话启动失败';
        setError(message);
      }
    },
    []
  );

  const endSession = useCallback(async () => {
    try {
      setError(null);

      if (!currentSession || !currentSession.id) {
        throw new Error('没有活跃会话');
      }

      const updatedSession: UserSession = {
        ...currentSession,
        endTime: Date.now(),
      };

      // 更新会话
      await emgDatabase.saveSession(updatedSession);
      setCurrentSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '会话结束失败';
      setError(message);
    }
  }, [currentSession]);

  const updateSessionStats = useCallback(
    async (
      trainingCount: number,
      recognitionCount: number,
      accuracy?: number
    ) => {
      try {
        setError(null);

        if (!currentSession) {
          throw new Error('没有活跃会话');
        }

        const updatedSession: UserSession = {
          ...currentSession,
          trainingCount,
          recognitionCount,
          recognitionAccuracy: accuracy,
        };

        setCurrentSession(updatedSession);
        // ✅ 新发现7修复：保存会话统计到IndexedDB
        await emgDatabase.saveSession(updatedSession);
      } catch (err) {
        const message = err instanceof Error ? err.message : '更新失败';
        setError(message);
      }
    },
    [currentSession]
  );

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const allSessions = await emgDatabase.getAllSessions();
      setSessions(allSessions);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    }
  }, []);

  const deleteSession = useCallback(
    async (id: number) => {
      try {
        setError(null);
        // 从数据库删除（需要扩展 emgDatabase）
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : '删除失败';
        setError(message);
      }
    },
    []
  );

  return {
    currentSession,
    sessions,
    error,
    startSession,
    endSession,
    updateSessionStats,
    loadSessions,
    deleteSession,
  };
}
