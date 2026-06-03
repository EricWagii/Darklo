/**
 * useMountedState Hook - 防止组件卸载后更新状态
 * 用于异步操作中的状态更新安全性
 */

import { useEffect, useRef, useCallback } from 'react';

export function useMountedState() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isMounted = useCallback(() => isMountedRef.current, []);

  return isMounted;
}

export default useMountedState;
