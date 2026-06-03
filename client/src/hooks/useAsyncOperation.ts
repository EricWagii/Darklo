/**
 * useAsyncOperation Hook - 统一的异步操作状态管理
 * 处理 loading、error、data 状态，支持自动清理
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseAsyncOperationState<T> {
  isLoading: boolean;
  error: Error | null;
  data: T | null;
}

interface UseAsyncOperationResult<T> extends UseAsyncOperationState<T> {
  execute: (operation: () => Promise<T>) => Promise<T>;
  reset: () => void;
}

export function useAsyncOperation<T>(): UseAsyncOperationResult<T> {
  const [state, setState] = useState<UseAsyncOperationState<T>>({
    isLoading: false,
    error: null,
    data: null,
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T> => {
    if (!isMountedRef.current) return null as T;

    setState({
      isLoading: true,
      error: null,
      data: null,
    });

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setState({
          isLoading: false,
          error: null,
          data: result,
        });
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState({
          isLoading: false,
          error,
          data: null,
        });
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
    }
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

export default useAsyncOperation;
