/**
 * 数据变更事件系统
 * 用于在删除数据后通知所有页面清空缓存
 * 
 * 这是彻底解决删除功能失败的关键：
 * 1. 删除操作完成后，发送事件通知所有页面
 * 2. 所有页面监听这个事件，自动清空缓存和重新加载数据
 * 3. 确保没有任何页面持有过期的数据
 */

export enum DataChangeEventType {
  COLLECTION_DELETED = 'COLLECTION_DELETED',      // 单条采集被删除
  COMMAND_DELETED = 'COMMAND_DELETED',            // 指令被删除
  COMMAND_SAVED = 'COMMAND_SAVED',                // ✅ 修改7：指令被保存（新增采集）
  ALL_DATA_CLEARED = 'ALL_DATA_CLEARED',          // 所有数据被清空
  DATA_RELOADED = 'DATA_RELOADED',                // 数据已重新加载
}

export interface DataChangeEvent {
  type: DataChangeEventType;
  commandName?: string;                           // 受影响的指令名称
  collectionId?: string;                          // 受影响的采集ID
  timestamp: number;
  source: string;                                 // 事件来源（哪个页面触发的）
}

class DataChangeEventManager {
  private listeners: Map<DataChangeEventType, Set<(event: DataChangeEvent) => void>> = new Map();
  private eventHistory: DataChangeEvent[] = [];
  private maxHistorySize = 100;

  /**
   * 监听数据变更事件
   */
  on(eventType: DataChangeEventType, callback: (event: DataChangeEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // 返回取消监听的函数
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * 监听所有事件
   */
  onAny(callback: (event: DataChangeEvent) => void): () => void {
    const unsubscribers: Array<() => void> = [];
    Object.values(DataChangeEventType).forEach((eventType) => {
      unsubscribers.push(this.on(eventType as DataChangeEventType, callback));
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * 发送数据变更事件
   */
  emit(event: DataChangeEvent): void {
    console.log(`[数据变更事件] ${event.type} - 来自 ${event.source}`, event);

    // 记录到历史
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // 通知所有监听器
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('[数据变更事件处理错误]', error);
        }
      });
    }
  }

  /**
   * 发送采集删除事件
   */
  emitCollectionDeleted(commandName: string, collectionId: string, source: string): void {
    this.emit({
      type: DataChangeEventType.COLLECTION_DELETED,
      commandName,
      collectionId,
      timestamp: Date.now(),
      source,
    });
  }

  /**
   * 发送指令删除事件
   */
  emitCommandDeleted(commandName: string, source: string): void {
    this.emit({
      type: DataChangeEventType.COMMAND_DELETED,
      commandName,
      timestamp: Date.now(),
      source,
    });
  }

  /**
   * ✅ 修改7：发送指令保存事件（新增采集）
   */
  emitCommandSaved(commandName: string, source: string): void {
    this.emit({
      type: DataChangeEventType.COMMAND_SAVED,
      commandName,
      timestamp: Date.now(),
      source,
    });
  }

  /**
   * 发送所有数据清空事件
   */
  emitAllDataCleared(source: string): void {
    this.emit({
      type: DataChangeEventType.ALL_DATA_CLEARED,
      timestamp: Date.now(),
      source,
    });
  }

  /**
   * 获取事件历史
   */
  getHistory(): DataChangeEvent[] {
    return [...this.eventHistory];
  }

  /**
   * 清空事件历史
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

// 导出单例
export const dataChangeEventManager = new DataChangeEventManager();
