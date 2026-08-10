export interface CollectionCommandInputLockState {
  sessionCommandName: string | null;
  unsavedCount: number;
  isCollecting: boolean;
  countdownTime: number;
  isSaving: boolean;
}

export interface CommandOwnedCollection {
  commandName?: string;
}

export const normalizeCollectionCommandName = (commandName: string): string =>
  commandName.trim();

export const resolveCollectionSessionCommand = (
  draftCommandName: string,
  sessionCommandName: string | null,
): string => normalizeCollectionCommandName(sessionCommandName || draftCommandName);

export const isCollectionCommandInputLocked = ({
  sessionCommandName,
  unsavedCount,
  isCollecting,
  countdownTime,
  isSaving,
}: CollectionCommandInputLockState): boolean => Boolean(
  sessionCommandName
  || unsavedCount > 0
  || isCollecting
  || countdownTime > 0
  || isSaving,
);

export const getCollectionCommandBatchConflict = (
  expectedCommandName: string,
  collections: CommandOwnedCollection[],
): string | null => {
  const expected = normalizeCollectionCommandName(expectedCommandName);
  const recordedCommands = Array.from(new Set(
    collections
      .map((collection) => normalizeCollectionCommandName(collection.commandName || ''))
      .filter(Boolean),
  ));

  const conflictingCommands = recordedCommands.filter((command) => command !== expected);
  if (conflictingCommands.length === 0) {
    return null;
  }

  const allCommands = Array.from(new Set([expected, ...recordedCommands])).filter(Boolean);
  return `当前采集批次混有多个指令或归属不一致：${allCommands.join('、')}。请丢弃该批次并分别重新采集，系统已阻止写入数据库。`;
};
