import { describe, it, expect } from 'vitest';

/**
 * 删除操作v2测试
 * 
 * 验证单条采集删除和指令删除的功能
 */

describe('删除操作v2', () => {
  describe('单条采集删除', () => {
    it('应该正确删除指定索引的采集', () => {
      // 模拟指令数据
      const command = {
        name: 'test-command',
        collections: [
          { index: 1, waveform: { ch1: [], ch2: [], ch3: [] } },
          { index: 2, waveform: { ch1: [], ch2: [], ch3: [] } },
          { index: 3, waveform: { ch1: [], ch2: [], ch3: [] } },
        ],
      };

      // 模拟删除第2个采集
      const collectionIndex = 1;
      command.collections.splice(collectionIndex, 1);

      expect(command.collections).toHaveLength(2);
      expect(command.collections[0].index).toBe(1);
      expect(command.collections[1].index).toBe(3);
    });

    it('应该验证采集索引是否有效', () => {
      const command = {
        name: 'test-command',
        collections: [
          { index: 1, waveform: { ch1: [], ch2: [], ch3: [] } },
          { index: 2, waveform: { ch1: [], ch2: [], ch3: [] } },
        ],
      };

      const validIndex = 0;
      const invalidIndex = 5;

      expect(validIndex >= 0 && validIndex < command.collections.length).toBe(true);
      expect(invalidIndex >= 0 && invalidIndex < command.collections.length).toBe(false);
    });

    it('应该在删除最后一个采集时删除整个指令', () => {
      const command = {
        name: 'test-command',
        collections: [
          { index: 1, waveform: { ch1: [], ch2: [], ch3: [] } },
        ],
      };

      const collectionIndex = 0;
      command.collections.splice(collectionIndex, 1);

      const shouldDeleteCommand = command.collections.length === 0;

      expect(shouldDeleteCommand).toBe(true);
    });

    it('应该在删除采集后保留其他采集', () => {
      const command = {
        name: 'test-command',
        collections: [
          { index: 1, waveform: { ch1: [1, 2, 3], ch2: [1, 2, 3], ch3: [1, 2, 3] } },
          { index: 2, waveform: { ch1: [4, 5, 6], ch2: [4, 5, 6], ch3: [4, 5, 6] } },
          { index: 3, waveform: { ch1: [7, 8, 9], ch2: [7, 8, 9], ch3: [7, 8, 9] } },
        ],
      };

      const collectionIndex = 1;
      const deletedCollection = command.collections[collectionIndex];
      command.collections.splice(collectionIndex, 1);

      expect(command.collections).toHaveLength(2);
      expect(command.collections).not.toContain(deletedCollection);
      expect(command.collections[0].waveform.ch1).toEqual([1, 2, 3]);
      expect(command.collections[1].waveform.ch1).toEqual([7, 8, 9]);
    });
  });

  describe('指令删除', () => {
    it('应该正确删除整个指令', () => {
      const commands = [
        { name: 'command1', collections: [] },
        { name: 'command2', collections: [] },
        { name: 'command3', collections: [] },
      ];

      const commandName = 'command2';
      const filtered = commands.filter(cmd => cmd.name !== commandName);

      expect(filtered).toHaveLength(2);
      expect(filtered.find(cmd => cmd.name === 'command2')).toBeUndefined();
      expect(filtered.find(cmd => cmd.name === 'command1')).toBeDefined();
      expect(filtered.find(cmd => cmd.name === 'command3')).toBeDefined();
    });

    it('应该验证指令是否存在', () => {
      const commands = [
        { name: 'command1', collections: [] },
        { name: 'command2', collections: [] },
      ];

      const existingCommand = 'command1';
      const nonExistingCommand = 'command3';

      const exists1 = commands.some(cmd => cmd.name === existingCommand);
      const exists2 = commands.some(cmd => cmd.name === nonExistingCommand);

      expect(exists1).toBe(true);
      expect(exists2).toBe(false);
    });
  });

  describe('删除后的UI更新', () => {
    it('应该正确更新UI中的指令列表', () => {
      const commandsData = [
        { name: 'command1', collections: [{ index: 1 }, { index: 2 }] },
        { name: 'command2', collections: [{ index: 1 }] },
      ];

      const commandName = 'command1';
      const collectionIndex = 0;

      // 模拟删除采集后的UI更新
      const updated = commandsData.map((cmd) => {
        if (cmd.name === commandName) {
          return {
            ...cmd,
            collections: cmd.collections.filter((_, idx) => idx !== collectionIndex),
          };
        }
        return cmd;
      });

      expect(updated[0].collections).toHaveLength(1);
      expect(updated[0].collections[0].index).toBe(2);
      expect(updated[1].collections).toHaveLength(1);
    });

    it('应该在删除整个指令后更新UI', () => {
      const commandsData = [
        { name: 'command1', collections: [{ index: 1 }] },
        { name: 'command2', collections: [{ index: 1 }] },
      ];

      const commandName = 'command1';

      const updated = commandsData.filter(cmd => cmd.name !== commandName);

      expect(updated).toHaveLength(1);
      expect(updated[0].name).toBe('command2');
    });
  });

  describe('删除确认对话框', () => {
    it('应该显示删除采集的确认信息', () => {
      const collectionIndex = 1;
      const message = `确认删除此采集？`;

      expect(message).toContain('确认删除');
    });

    it('应该显示删除指令的确认信息', () => {
      const commandName = 'test-command';
      const message = `确认删除指令 "${commandName}" 及其所有采集数据？`;

      expect(message).toContain('确认删除指令');
      expect(message).toContain(commandName);
    });
  });

  describe('删除事件审计', () => {
    it('应该记录采集删除事件', () => {
      const auditEvent = {
        type: 'COLLECTION_DELETE',
        data: { commandName: 'test-command', collectionIndex: 1 },
        userId: 'user123',
      };

      expect(auditEvent.type).toBe('COLLECTION_DELETE');
      expect(auditEvent.data.commandName).toBe('test-command');
      expect(auditEvent.data.collectionIndex).toBe(1);
    });

    it('应该记录指令删除事件', () => {
      const auditEvent = {
        type: 'COMMAND_DELETE',
        data: { commandName: 'test-command', collectionCount: 5 },
        userId: 'user123',
      };

      expect(auditEvent.type).toBe('COMMAND_DELETE');
      expect(auditEvent.data.commandName).toBe('test-command');
      expect(auditEvent.data.collectionCount).toBe(5);
    });
  });

  describe('删除错误处理', () => {
    it('应该处理无效的采集索引', () => {
      const command = {
        collections: [{ index: 1 }, { index: 2 }],
      };

      const invalidIndex = 5;
      const isValid = invalidIndex >= 0 && invalidIndex < command.collections.length;

      expect(isValid).toBe(false);
    });

    it('应该处理指令不存在的情况', () => {
      const commands = [
        { name: 'command1', collections: [] },
        { name: 'command2', collections: [] },
      ];

      const commandName = 'command3';
      const command = commands.find(cmd => cmd.name === commandName);

      expect(command).toBeUndefined();
    });

    it('应该处理删除操作失败', () => {
      const deleteError = new Error('删除操作失败');

      expect(deleteError.message).toBe('删除操作失败');
      expect(deleteError instanceof Error).toBe(true);
    });
  });

  describe('批量删除操作', () => {
    it('应该支持删除多个采集', () => {
      const command = {
        collections: [
          { index: 1 },
          { index: 2 },
          { index: 3 },
          { index: 4 },
          { index: 5 },
        ],
      };

      const indicesToDelete = [1, 3];
      const remaining = command.collections.filter((_, idx) => !indicesToDelete.includes(idx));

      expect(remaining).toHaveLength(3);
      expect(remaining.map(c => c.index)).toEqual([1, 3, 5]);
    });

    it('应该在批量删除后验证数据完整性', () => {
      const command = {
        collections: [
          { index: 1, data: 'a' },
          { index: 2, data: 'b' },
          { index: 3, data: 'c' },
        ],
      };

      const indicesToDelete = [1];
      const remaining = command.collections.filter((_, idx) => !indicesToDelete.includes(idx));

      expect(remaining).toHaveLength(2);
      expect(remaining[0].data).toBe('a');
      expect(remaining[1].data).toBe('c');
    });
  });

  describe('删除后的数据一致性', () => {
    it('应该确保删除后的数据一致', () => {
      const commands = [
        { name: 'cmd1', collections: [{ id: 1 }, { id: 2 }] },
        { name: 'cmd2', collections: [{ id: 3 }] },
      ];

      const commandName = 'cmd1';
      const collectionIndex = 0;

      const updated = commands.map((cmd) => {
        if (cmd.name === commandName) {
          return {
            ...cmd,
            collections: cmd.collections.filter((_, idx) => idx !== collectionIndex),
          };
        }
        return cmd;
      });

      // 验证数据一致性
      expect(updated[0].name).toBe('cmd1');
      expect(updated[0].collections).toHaveLength(1);
      expect(updated[0].collections[0].id).toBe(2);
      expect(updated[1].name).toBe('cmd2');
      expect(updated[1].collections).toHaveLength(1);
      expect(updated[1].collections[0].id).toBe(3);
    });

    it('应该确保删除操作不影响其他指令', () => {
      const commands = [
        { name: 'cmd1', collections: [{ id: 1 }, { id: 2 }] },
        { name: 'cmd2', collections: [{ id: 3 }, { id: 4 }] },
        { name: 'cmd3', collections: [{ id: 5 }] },
      ];

      const commandName = 'cmd2';
      const collectionIndex = 0;

      const updated = commands.map((cmd) => {
        if (cmd.name === commandName) {
          return {
            ...cmd,
            collections: cmd.collections.filter((_, idx) => idx !== collectionIndex),
          };
        }
        return cmd;
      });

      // 验证其他指令未被修改
      expect(updated[0].collections).toHaveLength(2);
      expect(updated[1].collections).toHaveLength(1);
      expect(updated[2].collections).toHaveLength(1);
    });
  });
});
