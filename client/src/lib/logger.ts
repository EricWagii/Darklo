/**
 * Logger 工具 - 环境感知的日志输出
 * 在生产环境中自动禁用 log 和 debug，保留 error 和 warn
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * 普通日志 - 仅在开发环境输出
   */
  log: (...args: unknown[]): void => {
    if (isDev) {
      console.log('[EMG]', ...args);
    }
  },

  /**
   * 警告日志 - 开发和生产环境都输出
   */
  warn: (...args: unknown[]): void => {
    console.warn('[EMG Warning]', ...args);
  },

  /**
   * 错误日志 - 开发和生产环境都输出
   */
  error: (...args: unknown[]): void => {
    console.error('[EMG Error]', ...args);
  },

  /**
   * 调试日志 - 仅在开发环境输出
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug('[EMG Debug]', ...args);
    }
  },

  /**
   * 信息日志 - 仅在开发环境输出
   */
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info('[EMG Info]', ...args);
    }
  },

  /**
   * 性能计时开始
   */
  time: (label: string): void => {
    if (isDev) {
      console.time(`[EMG] ${label}`);
    }
  },

  /**
   * 性能计时结束
   */
  timeEnd: (label: string): void => {
    if (isDev) {
      console.timeEnd(`[EMG] ${label}`);
    }
  },
};

export default logger;
