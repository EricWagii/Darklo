import { AuditEventType, logAuditEvent } from './audit-log';
import { v4 as uuidv4 } from 'uuid';
import { DB_CONFIG } from '@shared/const';

// ✅ 修复：使用统一的 DB_CONFIG 从 shared/const.ts
// 不该在此文件中私自定义 DB_CONFIG

/**
 * EMG 数据库管理类
 */
export class EMGDatabase {
  db: IDBDatabase | null = null;
  db_instance: IDBDatabase | null = null;

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.DB_NAME, DB_CONFIG.DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        // 创建 commands store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.COMMANDS)) {
          db.createObjectStore(DB_CONFIG.STORES.COMMANDS, { keyPath: 'key' });
        }

        // 创建 recognitionRecords store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.RECOGNITION_RECORDS)) {
          db.createObjectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS, { keyPath: 'key' });
        }

        // 创建 feedbackData store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.FEEDBACK_DATA)) {
          db.createObjectStore(DB_CONFIG.STORES.FEEDBACK_DATA, { keyPath: 'key' });
        }

        // 创建 calibrationData store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CALIBRATION_DATA)) {
          db.createObjectStore(DB_CONFIG.STORES.CALIBRATION_DATA, { keyPath: 'key' });
        }

        // 创建 auditLogs store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.AUDIT_LOGS)) {
          db.createObjectStore(DB_CONFIG.STORES.AUDIT_LOGS, { keyPath: 'key' });
        }

        // 创建 commandTemplates store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.COMMAND_TEMPLATES)) {
          db.createObjectStore(DB_CONFIG.STORES.COMMAND_TEMPLATES, { keyPath: 'key' });
        }

        // 创建 cnnModel store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CNN_MODEL)) {
          db.createObjectStore(DB_CONFIG.STORES.CNN_MODEL, { keyPath: 'key' });
        }

        // 创建 cnnState store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CNN_STATE)) {
          db.createObjectStore(DB_CONFIG.STORES.CNN_STATE, { keyPath: 'key' });
        }

        // 创建 userAccounts store
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.USER_ACCOUNTS)) {
          db.createObjectStore(DB_CONFIG.STORES.USER_ACCOUNTS, { keyPath: 'key' });
        }

        // 创建其他缺失的 stores
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.TRAINING_DATA)) {
          db.createObjectStore(DB_CONFIG.STORES.TRAINING_DATA, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SESSIONS)) {
          db.createObjectStore(DB_CONFIG.STORES.SESSIONS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.MULTI_CHANNEL_FUSION)) {
          db.createObjectStore(DB_CONFIG.STORES.MULTI_CHANNEL_FUSION, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SYSTEM_VERSION)) {
          db.createObjectStore(DB_CONFIG.STORES.SYSTEM_VERSION, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS)) {
          db.createObjectStore(DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CNN_MODELS)) {
          db.createObjectStore(DB_CONFIG.STORES.CNN_MODELS, { keyPath: 'key' });
        }

        console.log('[DB] onupgradeneeded: 库版本升级到 v6, 已创建所有 object stores');
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        this.db_instance = event.target.result;
        console.log('[DB] IndexedDB 初始化成功');
        resolve();
      };

      request.onerror = () => {
        console.error('[DB] IndexedDB 初始化失败:', request.error);
        reject(new Error(`数据库初始化失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取指令
   * ✅ 修复：先按 key 查询，如果没有会根据 name 查找旧数据
   */
  async getCommand(name: string): Promise<any | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.COMMANDS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);
      
      // ✅ 修复：第一步：先按 key 查询
      const request = store.get(name);

      request.onsuccess = () => {
        // ✅ 修复：即使命中，也要检查并合并同名旧 key 记录
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const allCommands = getAllRequest.result || [];
          const matchingCommands = allCommands.filter((cmd: any) => cmd.name === name || cmd.key === name);
          
          if (matchingCommands.length > 1) {
            // ✅ 修复：发现多个同名记录时，自动合并
            console.warn(`[getCommand] 检测到 ${matchingCommands.length} 个同名记录: ${name}，正在合并...`);
            
            // 合并所有同名记录
            const mergedCommand: any = {
              key: name,  // 规范化 key
              name: name,
              collections: [],
              createdAt: matchingCommands[0].createdAt || Date.now(),
              updatedAt: Date.now(),
            };
            
            // 收集所有 collections（按 id 去重）
            const collectionIds = new Set<string>();
            for (const cmd of matchingCommands) {
              if (cmd.collections && Array.isArray(cmd.collections)) {
                for (const col of cmd.collections) {
                  if (col.id && !collectionIds.has(col.id)) {
                    collectionIds.add(col.id);
                    mergedCommand.collections.push(col);
                  }
                }
              }
            }
            
            // 保存合并后的记录
            const writeTransaction = this.db!.transaction(
              [DB_CONFIG.STORES.COMMANDS],
              'readwrite'
            );
            const writeStore = writeTransaction.objectStore(DB_CONFIG.STORES.COMMANDS);
            
            // 先删除旧记录
            for (const cmd of matchingCommands) {
              const deleteKey = cmd.key || cmd.name;
              if (deleteKey) {
                writeStore.delete(deleteKey);
              }
            }
            
            // 保存新记录
            writeStore.put(mergedCommand);
            
            writeTransaction.oncomplete = () => {
              console.log(`[getCommand] 合并完成: ${name}`);
              resolve(mergedCommand);
            };
            
            writeTransaction.onerror = () => {
              console.error('[getCommand] 合并失败:', writeTransaction.error);
              resolve(matchingCommands[0]);  // 失败时返回第一条
            };
            return;
          }
          
          const found = matchingCommands[0] || null;
          resolve(found);
        };
        
        getAllRequest.onerror = () => {
          console.error('[getCommand] 查询失败:', getAllRequest.error);
          reject(new Error(`获取指令失败: ${getAllRequest.error?.message || '未知错误'}`));
        };
      };

      request.onerror = () => {
        console.error('[getCommand] 查询失败:', request.error);
        reject(new Error(`获取指令失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有指令
   */
  async getAllCommands(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.COMMANDS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);
      const request = store.getAll();

      request.onsuccess = () => {
        const allCommands = request.result || [];
        
        // ✅ 修复5：真正的后台规范化：合并集合、削除旧键、写回子一条记录
        const deduplicatedMap = new Map<string, any>();
        const keysToDelete: string[] = [];
        
        allCommands.forEach((cmd: any) => {
          const cmdName = cmd.name || cmd.key;
          if (!cmdName) return;
          
          const existing = deduplicatedMap.get(cmdName);
          if (!existing) {
            // 第一次遇到这个名称
            deduplicatedMap.set(cmdName, cmd);
          } else {
            // 已经有同名指令，需要合并 collections
            const mergedCollections = [
              ...(existing.collections || []),
              ...(cmd.collections || [])
            ];
            
            // 按 collection.id 去重
            const collectionMap = new Map<string, any>();
            mergedCollections.forEach((col: any) => {
              const colId = col.id || `${col.timestamp}`;
              if (!collectionMap.has(colId)) {
                collectionMap.set(colId, col);
              }
            });
            
            // 更新现有记录
            existing.collections = Array.from(collectionMap.values());
            
            // 记录旧 key 以供削除
            if (cmd.key && cmd.key !== cmdName && cmd.key !== existing.key) {
              keysToDelete.push(cmd.key);
            }
          }
        });
        
        const deduplicated = Array.from(deduplicatedMap.entries()).map(([cmdName, cmd]: [string, any]) => ({
          ...cmd,
          key: cmdName,
          name: cmdName,
          updatedAt: cmd.updatedAt || Date.now(),
        }));
        console.log(`[getAllCommands] 原始 ${allCommands.length} 条记录，去重后 ${deduplicated.length} 条，需要削除 ${keysToDelete.length} 个旧键`);
        
        // ✅ 修复5：写回规范化记录并削除旧键
        if (keysToDelete.length > 0 || deduplicated.length < allCommands.length) {
          const writeTransaction = this.db!.transaction(
            [DB_CONFIG.STORES.COMMANDS],
            'readwrite'
          );
          const writeStore = writeTransaction.objectStore(DB_CONFIG.STORES.COMMANDS);
          
          // 写回所有规范化记录
          deduplicated.forEach((cmd: any) => {
            writeStore.put({
              ...cmd,
              key: cmd.name,
              name: cmd.name,
              updatedAt: Date.now(),
            });
          });
          
          // 削除旧键
          keysToDelete.forEach((key: string) => {
            writeStore.delete(key);
          });
          
          writeTransaction.oncomplete = () => {
            console.log('[getAllCommands] 后台规范化完成');
            resolve(deduplicated);
          };
          
          writeTransaction.onerror = () => {
            console.warn('[getAllCommands] 后台规范化写入失败，但仍然返回去重结果');
            resolve(deduplicated);
          };
        } else {
          resolve(deduplicated);
        }
      };

      request.onerror = () => {
        console.error('[getAllCommands] 查询失败:', request.error);
        reject(new Error(`获取所有指令失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存指令
   */
  async saveCommand(command: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    // ✅ 修复：确保 key === name
    const commandToSave = {
      ...command,
      key: command.name, // key 必须等于 name
      createdAt: command.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.COMMANDS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);
      const request = store.put(commandToSave);

      request.onsuccess = () => {
        console.log(`[saveCommand] 指令已保存: ${command.name}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[saveCommand] 保存失败:', request.error);
        reject(new Error(`保存指令失败: ${request.error?.message || '未知错误'}`));
      };
    });

    await this.clearDerivedRecognitionState('saveCommand');
  }

  /**
   * 删除指令
   * ✅ 修复：级联删除所有相关历史数据
   */
  /**
   * 删除指令
   * ✅ 修复：用 getAll() 删除所有同名 commands，级联删除所有相关历史数据
   */
  async deleteCommand(commandName: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    // ✅ 彻底修复：使用 async/await 风格的 Promise 包装，确保所有删除操作完成
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [
          DB_CONFIG.STORES.COMMANDS,
          DB_CONFIG.STORES.RECOGNITION_RECORDS,
          DB_CONFIG.STORES.FEEDBACK_DATA,
          DB_CONFIG.STORES.CALIBRATION_DATA,
        ],
        'readwrite'
      );

        // ✅ 修复：使用 cursor 遍历替代逐个 delete，确保删除操作真正完成
      const commandStore = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);
      const recognitionStore = transaction.objectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS);
      const feedbackStore = transaction.objectStore(DB_CONFIG.STORES.FEEDBACK_DATA);
      const calibrationStore = transaction.objectStore(DB_CONFIG.STORES.CALIBRATION_DATA);

      // ✅ 第一步：使用 cursor 删除所有同名 commands
      let commandDeleteCount = 0;
      const commandCursor = commandStore.openCursor();
      commandCursor.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const cmd = cursor.value;
          if (cmd.name === commandName || cmd.key === commandName) {
            cursor.delete();
            commandDeleteCount++;
            console.log(`[deleteCommand] ✓ command 已删除: ${cmd.key}`);
          }
          cursor.continue();
        } else {
          console.log(`[deleteCommand] 完成删除 ${commandDeleteCount} 条 command`);
        }
      };
      commandCursor.onerror = () => {
        console.error('[deleteCommand] 遍历 commands 失败:', commandCursor.error);
      };

      // ✅ 第二步：使用 cursor 删除所有相关的识别记录
      let recognitionDeleteCount = 0;
      const recognitionCursor = recognitionStore.openCursor();
      recognitionCursor.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // ✅ 修复6：检查所有可能的字段名（包括旧格式）
          if (record.commandName === commandName || 
              record.predictedCommand === commandName || 
              record.actualCommand === commandName ||
              record.command === commandName ||
              record.trueCommand === commandName ||
              record.userCorrection === commandName) {
            cursor.delete();
            recognitionDeleteCount++;
            console.log(`[deleteCommand] ✓ recognitionRecord 已削除 (${recognitionDeleteCount}): ${record.key}`);
          }
          cursor.continue();
        } else {
          console.log(`[deleteCommand] 完成削除 ${recognitionDeleteCount} 条 recognitionRecord`);
        }
      };
      recognitionCursor.onerror = () => {
        console.error('[deleteCommand] 遍历 recognitionRecords 失败:', recognitionCursor.error);
      };

      // ✅ 第三步：使用 cursor 删除所有相关的反馈数据
      let feedbackDeleteCount = 0;
      const feedbackCursor = feedbackStore.openCursor();
      feedbackCursor.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // ✅ 修复6：检查所有可能的字段名（包括旧格式）
          if (record.commandName === commandName || 
              record.predictedCommand === commandName || 
              record.actualCommand === commandName ||
              record.command === commandName ||
              record.trueCommand === commandName ||
              record.userCorrection === commandName) {
            cursor.delete();
            feedbackDeleteCount++;
            console.log(`[deleteCommand] ✓ feedbackRecord 已削除 (${feedbackDeleteCount}): ${record.key}`);
          }
          cursor.continue();
        } else {
          console.log(`[deleteCommand] 完成削除 ${feedbackDeleteCount} 条 feedbackRecord`);
        }
      };
      feedbackCursor.onerror = () => {
        console.error('[deleteCommand] 遍历 feedbackData 失败:', feedbackCursor.error);
      };

      // ✅ 第四步：使用 cursor 删除所有相关的校准数据
      let calibrationDeleteCount = 0;
      const calibrationCursor = calibrationStore.openCursor();
      calibrationCursor.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // ✅ 修复6：检查所有可能的字段名（包括旧格式）
          if (record.commandName === commandName || 
              record.predictedCommand === commandName || 
              record.actualCommand === commandName ||
              record.command === commandName ||
              record.trueCommand === commandName ||
              record.userCorrection === commandName) {
            cursor.delete();
            calibrationDeleteCount++;
            console.log(`[deleteCommand] ✓ calibrationRecord 已削除 (${calibrationDeleteCount}): ${record.key}`);
          }
          cursor.continue();
        } else {
          console.log(`[deleteCommand] 完成削除 ${calibrationDeleteCount} 条 calibrationRecord`);
        }
      };
      calibrationCursor.onerror = () => {
        console.error('[deleteCommand] 遍历 calibrationData 失败:', calibrationCursor.error);
      };

      transaction.oncomplete = () => {
        console.log(`[deleteCommand] 事务完成，开始验证删除结果`);
        
        // 验证：确认指令已被删除
        const verifyTransaction = this.db!.transaction([DB_CONFIG.STORES.COMMANDS], 'readonly');
        const verifyStore = verifyTransaction.objectStore(DB_CONFIG.STORES.COMMANDS);
        const verifyRequest = verifyStore.getAll();
        
        verifyRequest.onsuccess = () => {
          const allCommands = verifyRequest.result || [];
          const stillExists = allCommands.some((cmd: any) => cmd.name === commandName || cmd.key === commandName);
          
          if (stillExists) {
            console.error(`[deleteCommand] ❌ 删除验证失败！指令仍然存在: ${commandName}`);
            reject(new Error(`删除失败：指令仍然存在`));
          } else {
            console.log(`[deleteCommand] ✅ 删除验证成功！指令 "${commandName}" 已完全删除`);
            this.clearDerivedRecognitionState('deleteCommand')
              .then(resolve)
              .catch(reject);
          }
        };
        
        verifyRequest.onerror = () => {
          console.error('[deleteCommand] 验证查询失败:', verifyRequest.error);
          reject(new Error(`验证失败: ${verifyRequest.error?.message || '未知错误'}`));
        };
      };

      transaction.onerror = () => {
        console.error('[deleteCommand] 事务失败:', transaction.error);
        reject(new Error(`删除指令失败: ${transaction.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取指令的采集
   */
  async getCollection(commandName: string, collectionId: string): Promise<any | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const command = await this.getCommand(commandName);
    if (!command || !command.collections) {
      return null;
    }

    return command.collections.find((col: any) => col.id === collectionId) || null;
  }

  /**
   * 删除采集
   * ✅ 修复：删除前先合并所有同名指令，然后从合并后的规范记录中删除
   */
  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise(async (resolve, reject) => {
      try {
        // ✅ 修复：第一步：查询指令（只读事务）
        const allCommands = await this.getAllCommands();
        let foundCommand: any = null;
        let foundInCommandKey: any = null;
        let commandName: string | null = null;

        for (const cmd of allCommands) {
          if (cmd.collections && cmd.collections.some((col: any) => col.id === collectionId)) {
            if (cmd.key === cmd.name) {
              foundCommand = cmd;
              commandName = cmd.name;
            } else {
              foundInCommandKey = cmd;
              commandName = cmd.name;
            }
          }
        }

        if (!foundCommand && !foundInCommandKey) {
          // ✅ 修复：删除 0 条时必须 throw error，不能静默成功
          throw new Error(`采集不存在: ${collectionId}`);
        }

        // ✅ 修复：第二步：先合并所有同名 command
        if (commandName) {
          const matchingCommands = allCommands.filter(
            (cmd: any) => cmd.name === commandName
          );
          
          if (matchingCommands.length > 1) {
            console.log(`[deleteCollection] 检测到 ${matchingCommands.length} 个同名 command，正在合并...`);
            
            // 合并所有 collections（按 id 去重）
            const mergedCollections: any[] = [];
            const collectionIds = new Set<string>();
            for (const cmd of matchingCommands) {
              if (cmd.collections && Array.isArray(cmd.collections)) {
                for (const col of cmd.collections) {
                  if (col.id && !collectionIds.has(col.id)) {
                    collectionIds.add(col.id);
                    mergedCollections.push(col);
                  }
                }
              }
            }
            
            // 创建规范化的合并记录
            const mergedCommand = {
              key: commandName,
              name: commandName,
              collections: mergedCollections,
              createdAt: matchingCommands[0].createdAt || Date.now(),
              updatedAt: Date.now(),
            };
            
            // 删除所有旧记录，保存新记录
            const transaction = this.db!.transaction(
              [DB_CONFIG.STORES.COMMANDS],
              'readwrite'
            );
            const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);
            
            for (const cmd of matchingCommands) {
              const deleteKey = cmd.key || cmd.name;
              if (deleteKey) {
                store.delete(deleteKey);
              }
            }
            
            // 现在删除采集
            mergedCommand.collections = mergedCommand.collections.filter(
              (col: any) => col.id !== collectionId
            );
            
            // 如果 collections 为空，删除 command；否则保存
            if (mergedCommand.collections.length === 0) {
              console.log(`[deleteCollection] command 的 collections 为空，删除 command: ${commandName}`);
              // 不保存，直接删除
            } else {
              store.put(mergedCommand);
            }
            
            transaction.oncomplete = () => {
              console.log(`[deleteCollection] 采集已删除，同名 command 已合并: ${collectionId}`);
              this.clearDerivedRecognitionState('deleteCollection')
                .then(resolve)
                .catch(reject);
            };
            
            transaction.onerror = () => {
              console.error('[deleteCollection] 删除失败:', transaction.error);
              reject(new Error(`删除采集失败: ${transaction.error?.message || '未知错误'}`));
            };
            return;
          }
        }

        // ✅ 修复：第三步：删除采集并保存（读写事务）
        const transaction = this.db!.transaction(
          [DB_CONFIG.STORES.COMMANDS],
          'readwrite'
        );
        const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);

        if (foundCommand) {
          foundCommand.collections = foundCommand.collections.filter(
            (col: any) => col.id !== collectionId
          );
          
          // 如果 collections 为空，删除 command；否则保存
          if (foundCommand.collections.length === 0) {
            console.log(`[deleteCollection] command 的 collections 为空，删除 command: ${foundCommand.name}`);
            store.delete(foundCommand.key);
          } else {
            store.put(foundCommand);
          }
        }

        if (foundInCommandKey) {
          foundInCommandKey.collections = foundInCommandKey.collections.filter(
            (col: any) => col.id !== collectionId
          );
          
          // 如果 collections 为空，删除 command；否则保存
          if (foundInCommandKey.collections.length === 0) {
            console.log(`[deleteCollection] command 的 collections 为空，删除 command: ${foundInCommandKey.name}`);
            store.delete(foundInCommandKey.key);
          } else {
            store.put(foundInCommandKey);
          }
        }

        transaction.oncomplete = () => {
          console.log(`[deleteCollection] 采集已删除: ${collectionId}`);
          this.clearDerivedRecognitionState('deleteCollection')
            .then(resolve)
            .catch(reject);
        };

        transaction.onerror = () => {
          console.error('[deleteCollection] 删除失败:', transaction.error);
          reject(new Error(`删除采集失败: ${transaction.error?.message || '未知错误'}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 保存识别记录
   */
  async saveRecognitionRecord(record: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const recordToSave = {
      ...record,
      key: `recognition-${Date.now()}-${Math.random()}`,
      timestamp: record.timestamp instanceof Date ? record.timestamp.getTime() : record.timestamp,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.RECOGNITION_RECORDS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS);
      const request = store.put(recordToSave);

      request.onsuccess = () => {
        console.log('[saveRecognitionRecord] 识别记录已保存');
        resolve();
      };

      request.onerror = () => {
        console.error('[saveRecognitionRecord] 保存失败:', request.error);
        reject(new Error(`保存识别记录失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有识别记录
   */
  async getAllRecognitionRecords(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.RECOGNITION_RECORDS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[getAllRecognitionRecords] 查询失败:', request.error);
        reject(new Error(`获取识别记录失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存反馈数据
   */
  async saveFeedbackData(data: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const dataToSave = {
      ...data,
      key: `feedback-${Date.now()}-${Math.random()}`,
      timestamp: data.timestamp instanceof Date ? data.timestamp.getTime() : data.timestamp,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.FEEDBACK_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.FEEDBACK_DATA);
      const request = store.put(dataToSave);

      request.onsuccess = () => {
        console.log('[saveFeedbackData] 反馈数据已保存');
        resolve();
      };

      request.onerror = () => {
        console.error('[saveFeedbackData] 保存失败:', request.error);
        reject(new Error(`保存反馈数据失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有反馈数据
   */
  async getAllFeedbackData(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.FEEDBACK_DATA],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.FEEDBACK_DATA);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[getAllFeedbackData] 查询失败:', request.error);
        reject(new Error(`获取反馈数据失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存校准数据
   */
  async saveCalibrationData(data: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const dataToSave = {
      ...data,
      key: `calibration-${Date.now()}-${Math.random()}`,
      timestamp: data.timestamp instanceof Date ? data.timestamp.getTime() : data.timestamp,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CALIBRATION_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CALIBRATION_DATA);
      const request = store.put(dataToSave);

      request.onsuccess = () => {
        console.log('[saveCalibrationData] 校准数据已保存');
        resolve();
      };

      request.onerror = () => {
        console.error('[saveCalibrationData] 保存失败:', request.error);
        reject(new Error(`保存校准数据失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有校准数据
   */
  async getAllCalibrationData(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CALIBRATION_DATA],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CALIBRATION_DATA);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[getAllCalibrationData] 查询失败:', request.error);
        reject(new Error(`获取校准数据失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存命令模板
   */
  async saveCommandTemplate(template: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const templateToSave = {
      ...template,
      key: `template-${template.commandName}`,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.COMMAND_TEMPLATES],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.COMMAND_TEMPLATES);
      const request = store.put(templateToSave);

      request.onsuccess = () => {
        console.log(`[saveCommandTemplate] 命令模板已保存: ${template.commandName}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[saveCommandTemplate] 保存失败:', request.error);
        reject(new Error(`保存命令模板失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取命令模板
   */
  async getCommandTemplate(commandName: string): Promise<any | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.COMMAND_TEMPLATES],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.COMMAND_TEMPLATES);
      const request = store.get(`template-${commandName}`);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[getCommandTemplate] 查询失败:', request.error);
        reject(new Error(`获取命令模板失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存 CNN 模型
   */
  async saveCNNModel(model: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const modelToSave = {
      ...model,
      key: 'cnn-model',
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CNN_MODEL],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CNN_MODEL);
      const request = store.put(modelToSave);

      request.onsuccess = () => {
        console.log('[saveCNNModel] CNN 模型已保存');
        resolve();
      };

      request.onerror = () => {
        console.error('[saveCNNModel] 保存失败:', request.error);
        reject(new Error(`保存 CNN 模型失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取 CNN 模型
   */
  async getCNNModel(): Promise<any | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CNN_MODEL],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CNN_MODEL);
      const request = store.get('cnn-model');

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[getCNNModel] 查询失败:', request.error);
        reject(new Error(`获取 CNN 模型失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存 CNN 状态
   */
  async saveCNNState(state: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const stateToSave = {
      ...state,
      key: 'cnn-state',
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CNN_STATE],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CNN_STATE);
      const request = store.put(stateToSave);

      request.onsuccess = () => {
        console.log('[saveCNNState] CNN 状态已保存');
        resolve();
      };

      request.onerror = () => {
        console.error('[saveCNNState] 保存失败:', request.error);
        reject(new Error(`保存 CNN 状态失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取 CNN 状态
   */
  async getCNNState(): Promise<any | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CNN_STATE],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CNN_STATE);
      const request = store.get('cnn-state');

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[getCNNState] 查询失败:', request.error);
        reject(new Error(`获取 CNN 状态失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存用户账户
   */
  async saveUserAccount(account: any): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const accountToSave = {
      ...account,
      key: account.userId,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      const request = store.put(accountToSave);

      request.onsuccess = () => {
        console.log(`[saveUserAccount] 用户账户已保存: ${account.userId}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[saveUserAccount] 保存失败:', request.error);
        reject(new Error(`保存用户账户失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有用户账户
   */
  async getAllUserAccounts(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[getAllUserAccounts] 查询失败:', request.error);
        reject(new Error(`获取用户账户失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 清除所有数据
   */
  async clearAllData(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        Object.values(DB_CONFIG.STORES),
        'readwrite'
      );

      const stores = Object.values(DB_CONFIG.STORES);
      for (const storeName of stores) {
        const store = transaction.objectStore(storeName);
        store.clear();
      }

      transaction.oncomplete = () => {
        console.log('[clearAllData] 所有数据已清除');
        resolve();
      };

      transaction.onerror = () => {
        console.error('[clearAllData] 清除失败:', transaction.error);
        reject(new Error(`清除数据失败: ${transaction.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 清除所有会影响训练、识别和诊断的运行数据。
   * 保留用户账号、审计日志和系统版本，避免清空后无法登录或丢失操作记录。
   */
  async clearAllRuntimeData(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const storesToClear = [
      DB_CONFIG.STORES.COMMANDS,
      DB_CONFIG.STORES.RECOGNITION_RECORDS,
      DB_CONFIG.STORES.FEEDBACK_DATA,
      DB_CONFIG.STORES.CALIBRATION_DATA,
      DB_CONFIG.STORES.CNN_MODEL,
      DB_CONFIG.STORES.CNN_MODELS,
      DB_CONFIG.STORES.CNN_STATE,
      DB_CONFIG.STORES.COMMAND_TEMPLATES,
      DB_CONFIG.STORES.TRAINING_DATA,
      DB_CONFIG.STORES.SESSIONS,
      DB_CONFIG.STORES.MULTI_CHANNEL_FUSION,
      DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS,
    ];

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(storesToClear, 'readwrite');

      try {
        for (const storeName of storesToClear) {
          transaction.objectStore(storeName).clear();
        }
      } catch (error) {
        reject(new Error(`清除运行数据异常: ${error instanceof Error ? error.message : '未知错误'}`));
        return;
      }

      transaction.oncomplete = () => {
        console.log('[clearAllRuntimeData] 训练、识别和诊断运行数据已清除');
        resolve();
      };

      transaction.onerror = () => {
        console.error('[clearAllRuntimeData] 清除失败:', transaction.error);
        reject(new Error(`清除运行数据失败: ${transaction.error?.message || '未知错误'}`));
      };
    });

    await this.verifyStoresEmpty(storesToClear, 'clearAllRuntimeData');
  }

  private async clearDerivedRecognitionState(label: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const storesToClear = [
      DB_CONFIG.STORES.CNN_MODEL,
      DB_CONFIG.STORES.CNN_MODELS,
      DB_CONFIG.STORES.CNN_STATE,
      DB_CONFIG.STORES.MULTI_CHANNEL_FUSION,
      DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS,
    ];

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(storesToClear, 'readwrite');

      try {
        for (const storeName of storesToClear) {
          transaction.objectStore(storeName).clear();
        }
      } catch (error) {
        reject(new Error(`[${label}] 清除派生识别状态异常: ${error instanceof Error ? error.message : '未知错误'}`));
        return;
      }

      transaction.oncomplete = () => {
        console.log(`[${label}] 派生识别状态已失效`);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`[${label}] 清除派生识别状态失败: ${transaction.error?.message || '未知错误'}`));
      };
    });
  }

  private async verifyStoresEmpty(storeNames: string[], label: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const counts = await new Promise<Record<string, number>>((resolve, reject) => {
      const transaction = this.db!.transaction(storeNames, 'readonly');
      const result: Record<string, number> = {};

      for (const storeName of storeNames) {
        const request = transaction.objectStore(storeName).count();
        request.onsuccess = () => {
          result[storeName] = request.result;
        };
        request.onerror = () => {
          reject(new Error(`[${label}] 验证 ${storeName} 失败: ${request.error?.message || '未知错误'}`));
        };
      }

      transaction.oncomplete = () => {
        resolve(result);
      };

      transaction.onerror = () => {
        reject(new Error(`[${label}] 验证事务失败: ${transaction.error?.message || '未知错误'}`));
      };
    });

    const leftovers = Object.entries(counts).filter(([, count]) => count > 0);
    if (leftovers.length > 0) {
      const detail = leftovers.map(([storeName, count]) => `${storeName}: ${count}`).join(', ');
      throw new Error(`[${label}] 删除验证失败，仍有后台残留: ${detail}`);
    }
  }

  /**
   * 获取数据库实例
   */
  getDb(): IDBDatabase | null {
    return this.db;
  }

  /**
   * 保存训练数据
   */
  async saveTrainingData(data: any): Promise<void> {
    return this.saveCommand(data);
  }

  /**
   * 获取所有训练数据
   */
  async getAllTrainingData(): Promise<any[]> {
    return this.getAllCommands();
  }

  /**
   * 保存会话
   */
  async saveSession(session: any): Promise<void> {
    const sessionToSave = {
      ...session,
      key: `session-${session.sessionId || Date.now()}`,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      const request = store.put(sessionToSave);

      request.onsuccess = () => {
        console.log('[saveSession] 会话已保存');
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`保存会话失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有会话
   */
  async getAllSessions(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      const request = store.getAll();

      request.onsuccess = () => {
        const allRecords = request.result || [];
        const sessions = allRecords.filter((r: any) => r.key && r.key.startsWith('session-'));
        resolve(sessions);
      };

      request.onerror = () => {
        reject(new Error(`获取会话失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存校准数据（别名）
   */
  async saveCalibration(data: any): Promise<void> {
    return this.saveCalibrationData(data);
  }

  /**
   * 获取校准数据
   */
  async getCalibration(): Promise<any | null> {
    const allData = await this.getAllCalibrationData();
    return allData.length > 0 ? allData[allData.length - 1] : null;
  }

  /**
   * 清除校准数据
   */
  async clearCalibration(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CALIBRATION_DATA],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CALIBRATION_DATA);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[clearCalibration] 校准数据已清除');
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`清除校准数据失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 保存模型（别名）
   */
  async saveModel(model: any): Promise<void> {
    return this.saveCNNModel(model);
  }

  /**
   * 获取模型
   */
  async getModel(): Promise<any | null> {
    return this.getCNNModel();
  }

  /**
   * 删除模型
   */
  async deleteModel(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.CNN_MODEL],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.CNN_MODEL);
      const request = store.delete('cnn-model');

      request.onsuccess = () => {
        console.log('[deleteModel] 模型已删除');
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`删除模型失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 获取所有审计日志
   */
  async getAllAuditLogs(): Promise<any[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`获取审计日志失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 清除所有训练数据
   */
  async clearAllTrainingData(): Promise<void> {
    return this.clearAllRuntimeData();
  }

  /**
   * 删除识别记录
   */
  async deleteRecognitionRecord(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.RECOGNITION_RECORDS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS);
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log('[deleteRecognitionRecord] 识别记录已删除');
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`删除识别记录失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 清除所有识别记录
   */
  async clearAllRecognitionRecords(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [DB_CONFIG.STORES.RECOGNITION_RECORDS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.RECOGNITION_RECORDS);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[clearAllRecognitionRecords] 所有识别记录已清除');
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`清除识别记录失败: ${request.error?.message || '未知错误'}`));
      };
    });
  }

  /**
   * 清除所有指令
   */
  async clearAllCommands(): Promise<void> {
    return this.clearAllRuntimeData();
  }

}

// 创建全局数据库实例
export const emgDatabase = new EMGDatabase();
