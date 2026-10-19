import type { GestureConfig, GestureFrame, GesturePrediction } from './gesture-contract';

/** Separate from EMGDatabase v6 so deploying or rolling back the demo never upgrades it. */
export const GESTURE_ARCHIVE_DB_NAME = 'darklo-gesture-archive-v1';
export interface ArchiveMeta {
  id: string;
  createdAt: number;
  mode: 'training' | 'single' | 'sequence' | 'model';
  label?: string;
  calibrationId?: string;
  config: GestureConfig;
  modelSnapshot?: unknown;
  windowCount: number;
}
export interface ArchiveResult {
  predictions: GesturePrediction[];
  expectedLabels?: string[];
  frameCount: number;
  status?: 'complete' | 'interrupted';
}
export interface ArchiveAnnotation { createdAt: number; expectedLabels: string[] }
export interface ArchiveEntry {
  ownerId: string;
  sourceOwnerId?: string;
  meta: ArchiveMeta;
  status: 'capturing' | 'complete' | 'interrupted';
  rawFrames: GestureFrame[];
  chunkSizes: number[];
  result?: ArchiveResult;
  annotations?: ArchiveAnnotation[];
  trainingSelections?: Array<{ createdAt: number; included: boolean }>;
}
export interface ArchiveImportOptions { rebindOwner?: boolean }
type StoredEntry = Omit<ArchiveEntry, 'rawFrames'> & { id: string };
interface StoredChunk { ownerId: string; id: string; chunkIndex: number; frames: GestureFrame[] }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Reject values that a JSON backup would silently alter or omit. */
function validateJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { assert(Number.isFinite(value), '归档数值必须有限'); return; }
  assert(typeof value === 'object' && value !== null, '归档快照必须是可完整保存的 JSON');
  assert(!ancestors.has(value), '归档快照包含循环引用');
  assert(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, '归档快照必须使用普通 JSON 对象');
  ancestors.add(value);
  for (const child of Object.values(value)) validateJson(child, ancestors);
  ancestors.delete(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  assert(Object.keys(value).every((key) => allowed.includes(key)), '归档包含不支持的字段');
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const same = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);

function validateMeta(value: unknown): asserts value is ArchiveMeta {
  assert(object(value), '归档 meta 格式无效');
  keys(value, ['id', 'createdAt', 'mode', 'label', 'calibrationId', 'config', 'modelSnapshot', 'windowCount']);
  assert(nonempty(value.id) && finite(value.createdAt) && value.createdAt >= 0, '归档 ID 或创建时间无效');
  assert(['training', 'single', 'sequence', 'model'].includes(value.mode as string), '归档模式无效');
  assert(value.label === undefined || typeof value.label === 'string', '归档 label 无效');
  assert(value.calibrationId === undefined || nonempty(value.calibrationId), '校准分组 ID 无效');
  assert(Number.isSafeInteger(value.windowCount) && (value.mode === 'model' ? value.windowCount === 0 : (value.windowCount as number) > 0), '归档窗口数量无效');
  if (value.mode === 'model') assert(value.modelSnapshot !== undefined && value.modelSnapshot !== null, '模型归档必须包含模型快照');
  const config = value.config;
  assert(object(config), '归档采样配置无效');
  keys(config, ['sampleRate', 'channel', 'windowSeconds', 'mainsHz']);
  assert([500, 1000].includes(config.sampleRate as number) && [0, 1, 2].includes(config.channel as number), '归档采样率或通道无效');
  assert(config.windowSeconds === 4, '归档 v1 仅支持 4 秒采集窗口');
  assert([0, 50, 60].includes(config.mainsHz as number), '归档工频配置无效');
  if (value.modelSnapshot !== undefined) validateJson(value.modelSnapshot);
}
function validateFrames(value: unknown): asserts value is GestureFrame[] {
  assert(Array.isArray(value), '原始帧必须为数组');
  let previous = -Infinity;
  for (const frame of value) {
    assert(object(frame), '原始帧格式无效');
    keys(frame, ['receivedAtMs', 'channels']);
    assert(finite(frame.receivedAtMs) && frame.receivedAtMs >= 0 && frame.receivedAtMs >= previous, '原始帧接收时间无效或逆序');
    assert(Array.isArray(frame.channels) && frame.channels.length === 3 && frame.channels.every(finite), '原始帧三通道必须为有限数值');
    previous = frame.receivedAtMs;
  }
}
function validateLabels(value: unknown, count: number): asserts value is string[] {
  assert(Array.isArray(value) && value.length === count && value.every((label) => typeof label === 'string'), '人工标签数量必须与预测数量一致');
}
function validatePrediction(value: unknown): asserts value is GesturePrediction {
  assert(object(value), '预测格式无效');
  keys(value, ['status', 'labelId', 'labelName', 'reason', 'scores', 'diagnostics']);
  assert(['recognized', 'rest', 'unknown', 'invalid'].includes(value.status as string), '预测状态无效');
  assert(value.labelId === undefined || typeof value.labelId === 'string', '预测 labelId 无效');
  assert(value.labelName === undefined || typeof value.labelName === 'string', '预测 labelName 无效');
  assert(typeof value.reason === 'string' && Array.isArray(value.scores), '预测原因或分数无效');
  for (const score of value.scores) {
    assert(object(score), '预测分数无效'); keys(score, ['labelId', 'distance']);
    assert(typeof score.labelId === 'string' && finite(score.distance), '预测分数必须为有限数值');
  }
  assert(object(value.diagnostics) && Object.values(value.diagnostics).every((item) => typeof item === 'string' || typeof item === 'boolean' || finite(item)), '预测诊断值无效');
}
function validateResult(value: unknown): asserts value is ArchiveResult {
  assert(object(value), '归档结果格式无效');
  keys(value, ['predictions', 'expectedLabels', 'frameCount', 'status']);
  assert(Number.isSafeInteger(value.frameCount) && (value.frameCount as number) >= 0 && Array.isArray(value.predictions), '归档结果帧数或预测无效');
  value.predictions.forEach(validatePrediction);
  assert(value.status === undefined || ['complete', 'interrupted'].includes(value.status as string), '归档完成状态无效');
  if (value.expectedLabels !== undefined) validateLabels(value.expectedLabels, value.predictions.length);
}
function validatePredictionCount(meta: ArchiveMeta, result: ArchiveResult): void {
  if (meta.mode === 'training' || meta.mode === 'model') assert(result.predictions.length === 0, '训练与模型归档不能包含测试预测');
  else {
    assert(result.predictions.length <= meta.windowCount, '预测数量超出采集窗口数量');
    if (result.status !== 'interrupted') assert(result.predictions.length === meta.windowCount, '预测窗口不完整，不能标记已完成');
  }
}
function validateEntry(value: unknown, ownerId: string): asserts value is ArchiveEntry {
  assert(object(value), '归档条目格式无效');
  keys(value, ['ownerId', 'sourceOwnerId', 'meta', 'status', 'rawFrames', 'chunkSizes', 'result', 'annotations', 'trainingSelections']);
  assert(value.ownerId === ownerId, '归档 owner 与当前用户不一致');
  assert(value.sourceOwnerId === undefined || nonempty(value.sourceOwnerId), '归档原始 owner 无效');
  validateMeta(value.meta); validateFrames(value.rawFrames);
  assert(['capturing', 'complete', 'interrupted'].includes(value.status as string), '归档条目状态无效');
  assert(Array.isArray(value.chunkSizes) && value.chunkSizes.every((size) => Number.isSafeInteger(size) && size > 0), '原始 chunk 长度无效');
  assert(value.chunkSizes.reduce((sum: number, size: number) => sum + size, 0) === value.rawFrames.length, '原始 chunk 与帧总数不一致');
  if (value.meta.mode === 'model') assert(value.rawFrames.length === 0, '模型归档不能包含采样帧');
  if (value.status === 'capturing') assert(value.result === undefined, '未完成采集不能含完成结果');
  else {
    validateResult(value.result);
    validatePredictionCount(value.meta, value.result);
    assert(value.result.frameCount === value.rawFrames.length && value.result.status === value.status, '结果状态或帧数不一致');
    assert(value.status === 'interrupted' || value.rawFrames.length > 0 || value.meta.mode === 'model', '没有原始帧不能标为完成');
    if (value.meta.mode === 'model') assert(value.result.predictions.length === 0, '模型归档不能包含预测');
  }
  if (value.annotations !== undefined) {
    assert(Array.isArray(value.annotations) && value.result !== undefined, '标注必须关联已保存预测');
    for (const annotation of value.annotations) {
      assert(object(annotation), '标注格式无效'); keys(annotation, ['createdAt', 'expectedLabels']);
      assert(finite(annotation.createdAt) && annotation.createdAt >= 0, '标注时间无效');
      validateLabels(annotation.expectedLabels, (value.result as ArchiveResult).predictions.length);
    }
  }
  if (value.trainingSelections !== undefined) {
    assert(value.meta.mode === 'training' && Array.isArray(value.trainingSelections), '只有训练记录可以包含样本选择历史');
    for (const selection of value.trainingSelections) {
      assert(object(selection), '训练样本选择格式无效'); keys(selection, ['createdAt', 'included']);
      assert(finite(selection.createdAt) && selection.createdAt >= 0 && typeof selection.included === 'boolean', '训练样本选择时间或状态无效');
    }
  }
}

export function createArchiveEntry(ownerId: string, meta: ArchiveMeta): ArchiveEntry {
  assert(nonempty(ownerId), '归档用户 ownerId 不能为空'); validateMeta(meta);
  // Optional fields with undefined are omitted consistently before a snapshot is frozen.
  return { ownerId, meta: clone(meta), status: 'capturing', rawFrames: [], chunkSizes: [] };
}
export function appendArchiveFrames(entry: ArchiveEntry, chunkIndex: number, frames: GestureFrame[]): ArchiveEntry {
  assert(entry.status === 'capturing', '已结束的归档不可追加采样');
  assert(entry.meta.mode !== 'model', '模型归档不能追加采样');
  assert(Number.isSafeInteger(chunkIndex) && chunkIndex >= 0 && chunkIndex <= entry.chunkSizes.length, 'chunk 必须按顺序追加，不能有缺口');
  validateFrames(frames); assert(frames.length > 0, '原始 chunk 不能为空');
  if (chunkIndex < entry.chunkSizes.length) {
    const start = entry.chunkSizes.slice(0, chunkIndex).reduce((sum, size) => sum + size, 0);
    assert(same(entry.rawFrames.slice(start, start + entry.chunkSizes[chunkIndex]), frames), '重复 chunk 内容冲突');
    return clone(entry);
  }
  assert(entry.rawFrames.length === 0 || frames[0].receivedAtMs >= entry.rawFrames.at(-1)!.receivedAtMs, '原始帧时间不能逆序');
  return { ...clone(entry), rawFrames: [...clone(entry.rawFrames), ...clone(frames)], chunkSizes: [...entry.chunkSizes, frames.length] };
}
export function finishArchiveEntry(entry: ArchiveEntry, result: ArchiveResult): ArchiveEntry {
  validateResult(result);
  validatePredictionCount(entry.meta, result);
  assert(result.frameCount === entry.rawFrames.length, '完成帧数与已保存原始帧数量不一致');
  const frozen = clone({ ...result, status: result.status ?? 'complete' });
  assert(frozen.status === 'interrupted' || result.frameCount > 0 || entry.meta.mode === 'model', '没有原始帧不能标为完成');
  if (entry.meta.mode === 'model') assert(result.frameCount === 0 && result.predictions.length === 0, '模型归档不能包含采样帧或预测');
  if (entry.status !== 'capturing') {
    assert(same(entry.result, frozen), '已保存结果冲突，不可覆盖原预测'); return clone(entry);
  }
  return { ...clone(entry), result: frozen, status: frozen.status };
}
export function annotateArchiveEntry(entry: ArchiveEntry, expectedLabels: string[], createdAt = Date.now()): ArchiveEntry {
  assert(entry.result !== undefined, '请先保存识别结果再添加人工标签');
  validateLabels(expectedLabels, entry.result.predictions.length);
  assert(finite(createdAt) && createdAt >= 0, '标注时间无效');
  return { ...clone(entry), annotations: [...clone(entry.annotations ?? []), { createdAt, expectedLabels: [...expectedLabels] }] };
}
export function setArchiveTrainingIncluded(entry: ArchiveEntry, included: boolean, createdAt = Date.now()): ArchiveEntry {
  assert(entry.meta.mode === 'training', '只有训练记录可以选择是否参与训练');
  assert(typeof included === 'boolean' && finite(createdAt) && createdAt >= 0, '训练样本选择时间或状态无效');
  return { ...clone(entry), trainingSelections: [...clone(entry.trainingSelections ?? []), { createdAt, included }] };
}

async function checksum(value: unknown): Promise<string> {
  assert(globalThis.crypto?.subtle, '当前环境不支持归档 SHA-256 校验');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function serializeArchiveBundle(ownerId: string, entries: ArchiveEntry[]): Promise<string> {
  assert(nonempty(ownerId), '归档用户 ownerId 不能为空');
  entries.forEach((entry) => validateEntry(entry, ownerId));
  const frozen = clone(entries);
  assert(new Set(frozen.map((entry) => entry.meta.id)).size === frozen.length, '归档包含重复 ID');
  const hashes = await Promise.all(frozen.map(async (entry) => ({ id: entry.meta.id, sha256: await checksum(entry) })));
  return JSON.stringify({ format: 'darklo-gesture-archive', version: 1, ownerId, exportedAt: Date.now(), entries: frozen, checksums: hashes });
}
export async function parseArchiveBundle(text: string, ownerId: string, options: ArchiveImportOptions = {}): Promise<ArchiveEntry[]> {
  const bundle: unknown = JSON.parse(text);
  assert(object(bundle), '归档文件格式无效');
  keys(bundle, ['format', 'version', 'ownerId', 'exportedAt', 'entries', 'checksums']);
  assert(bundle.format === 'darklo-gesture-archive' && bundle.version === 1, '不支持的归档版本');
  assert(nonempty(ownerId) && nonempty(bundle.ownerId), '归档 owner 无效');
  assert(bundle.ownerId === ownerId || options.rebindOwner === true, '归档 owner 与当前用户不一致');
  assert(finite(bundle.exportedAt) && bundle.exportedAt >= 0 && Array.isArray(bundle.entries) && Array.isArray(bundle.checksums), '归档结构无效');
  const entries = bundle.entries;
  const sourceOwnerId = bundle.ownerId;
  entries.forEach((entry) => validateEntry(entry, sourceOwnerId));
  assert(new Set(entries.map((entry: ArchiveEntry) => entry.meta.id)).size === entries.length, '导入文件包含重复 ID');
  assert(bundle.checksums.length === entries.length, '归档校验清单不完整');
  const hashes = new Map<string, string>();
  for (const item of bundle.checksums) {
    assert(object(item), '归档校验格式无效'); keys(item, ['id', 'sha256']);
    assert(nonempty(item.id) && typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256) && !hashes.has(item.id), '归档校验格式无效或重复');
    hashes.set(item.id, item.sha256);
  }
  for (const entry of entries as ArchiveEntry[]) assert(hashes.get(entry.meta.id) === await checksum(entry), '归档 checksum 校验失败，内容可能已损坏');
  const verified = clone(entries as ArchiveEntry[]);
  if (sourceOwnerId === ownerId) return verified;
  // Verify the original owner's bytes first. Explicit recovery changes ownership
  // only; the first owner remains traceable through repeated account recreation.
  return verified.map((entry) => ({ ...entry, ownerId, sourceOwnerId: entry.sourceOwnerId ?? entry.ownerId }));
}
export function planArchiveImport(existing: ArchiveEntry[], incoming: ArchiveEntry[], ownerId: string): { entries: ArchiveEntry[]; skipped: number } {
  existing.forEach((entry) => validateEntry(entry, ownerId));
  incoming.forEach((entry) => validateEntry(entry, ownerId));
  assert(new Set(incoming.map((entry) => entry.meta.id)).size === incoming.length, '导入文件包含重复 ID');
  const byId = new Map(existing.map((entry) => [entry.meta.id, entry]));
  const entries: ArchiveEntry[] = []; let skipped = 0;
  for (const entry of incoming) {
    const previous = byId.get(entry.meta.id);
    if (previous) { assert(same(previous, entry), `归档 ${entry.meta.id} 内容冲突，未覆盖`); skipped += 1; }
    else entries.push(clone(entry));
  }
  return { entries, skipped };
}

function header(entry: ArchiveEntry): StoredEntry {
  const { rawFrames: _frames, ...rest } = entry;
  return { ...rest, id: entry.meta.id };
}
function assemble(stored: StoredEntry, chunks: StoredChunk[]): ArchiveEntry {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  assert(sorted.length === stored.chunkSizes.length && sorted.every((chunk, index) => chunk.chunkIndex === index && chunk.frames.length === stored.chunkSizes[index]), '归档原始 chunk 缺失或不完整');
  const { id: _id, ...rest } = stored;
  const entry = { ...rest, rawFrames: sorted.flatMap((chunk) => chunk.frames) };
  validateEntry(entry, stored.ownerId); return entry;
}

/** All writes resolve on transaction completion, never on an individual request's success. */
function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (tx: IDBTransaction, done: (result: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(['sessions', 'chunks'], mode); } catch (error) { reject(error); return; }
    let result: T; let ready = false; let failure: unknown;
    const fail = (error: unknown) => { failure = error; try { tx.abort(); } catch { reject(error); } };
    tx.oncomplete = () => ready ? resolve(result) : reject(new Error('归档事务未返回完成结果'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('归档事务已中止，数据未保存'));
    tx.onerror = () => { failure ??= tx.error ?? new Error('归档写入失败'); };
    try { work(tx, (value) => { result = value; ready = true; }, fail); } catch (error) { fail(error); }
  });
}
function readEntryInTransaction(tx: IDBTransaction, ownerId: string, id: string, done: (entry: ArchiveEntry | null) => void, fail: (error: unknown) => void): void {
  const request = tx.objectStore('sessions').get([ownerId, id]);
  request.onsuccess = () => {
    if (!request.result) { done(null); return; }
    const chunks = tx.objectStore('chunks').index('entry').getAll([ownerId, id]);
    chunks.onsuccess = () => { try { done(assemble(request.result, chunks.result)); } catch (error) { fail(error); } };
  };
}
function readAllInTransaction(tx: IDBTransaction, ownerId: string, done: (entries: ArchiveEntry[]) => void, fail: (error: unknown) => void): void {
  const request = tx.objectStore('sessions').index('owner').getAll(ownerId);
  request.onsuccess = () => {
    const headers = request.result as StoredEntry[]; const entries: ArchiveEntry[] = [];
    if (!headers.length) { done(entries); return; }
    let remaining = headers.length;
    for (const stored of headers) {
      const chunks = tx.objectStore('chunks').index('entry').getAll([ownerId, stored.id]);
      chunks.onsuccess = () => {
        try { entries.push(assemble(stored, chunks.result)); if (--remaining === 0) done(entries.sort((a, b) => b.meta.createdAt - a.meta.createdAt)); }
        catch (error) { fail(error); }
      };
    }
  };
}

export function createGestureArchive(ownerId: string) {
  assert(nonempty(ownerId), '归档用户 ownerId 不能为空');
  let opening: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening;
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持 IndexedDB，原始数据无法持久保存')); return; }
      const request = globalThis.indexedDB.open(GESTURE_ARCHIVE_DB_NAME, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: ['ownerId', 'id'] }).createIndex('owner', 'ownerId');
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['ownerId', 'id', 'chunkIndex'] }).createIndex('entry', ['ownerId', 'id']);
      };
      request.onerror = () => { abandoned = true; reject(request.error ?? new Error('无法打开归档数据库')); };
      request.onblocked = () => { abandoned = true; reject(new Error('归档数据库被其他页面占用，请关闭旧页面后重试')); };
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch((error) => { opening = undefined; throw error; });
    return opening;
  };
  const read = async (id: string): Promise<ArchiveEntry | null> => transaction(await open(), 'readonly', (tx, done, fail) => readEntryInTransaction(tx, ownerId, id, done, fail));
  const list = async (): Promise<ArchiveEntry[]> => transaction(await open(), 'readonly', (tx, done, fail) => readAllInTransaction(tx, ownerId, done, fail));
  const mutate = async (id: string, update: (entry: ArchiveEntry, tx: IDBTransaction) => ArchiveEntry): Promise<void> => {
    await transaction<void>(await open(), 'readwrite', (tx, done, fail) => {
      readEntryInTransaction(tx, ownerId, id, (entry) => {
        try { assert(entry, '当前用户没有此归档'); const next = update(entry, tx); tx.objectStore('sessions').put(header(next)); done(); }
        catch (error) { fail(error); }
      }, fail);
    });
  };
  return {
    async begin(meta: ArchiveMeta): Promise<string> {
      const entry = createArchiveEntry(ownerId, meta);
      return transaction<string>(await open(), 'readwrite', (tx, done, fail) => {
        const request = tx.objectStore('sessions').get([ownerId, entry.meta.id]);
        request.onsuccess = () => {
          try {
            if (request.result) assert(same(request.result.meta, entry.meta), '归档 ID 冲突，不可覆盖已有会话');
            else tx.objectStore('sessions').add(header(entry));
            done(entry.meta.id);
          } catch (error) { fail(error); }
        };
      });
    },
    async append(id: string, chunkIndex: number, frames: GestureFrame[]): Promise<void> {
      validateFrames(frames); const frozen = clone(frames);
      // A live recording must not reload and copy all previous raw frames on every
      // chunk. Read only its header and the retry/previous chunk in one transaction.
      await transaction<void>(await open(), 'readwrite', (tx, done, fail) => {
        const sessions = tx.objectStore('sessions');
        const chunks = tx.objectStore('chunks');
        const request = sessions.get([ownerId, id]);
        request.onsuccess = () => {
          try {
            const stored = request.result as StoredEntry | undefined;
            assert(stored, '当前用户没有此归档');
            assert(stored.status === 'capturing' && stored.meta.mode !== 'model', '已结束或模型归档不可追加采样');
            assert(Number.isSafeInteger(chunkIndex) && chunkIndex >= 0 && chunkIndex <= stored.chunkSizes.length, 'chunk 必须按顺序追加，不能有缺口');
            assert(frozen.length > 0, '原始 chunk 不能为空');
            if (chunkIndex < stored.chunkSizes.length) {
              const retry = chunks.get([ownerId, id, chunkIndex]);
              retry.onsuccess = () => {
                try { assert(retry.result && same(retry.result.frames, frozen), '重复 chunk 内容冲突'); done(); }
                catch (error) { fail(error); }
              };
              return;
            }
            const commit = (previous: StoredChunk | null) => {
              try {
                if (chunkIndex > 0) {
                  assert(previous && previous.frames.length === stored.chunkSizes[chunkIndex - 1], '归档前一个 chunk 缺失或不完整');
                  assert(frozen[0].receivedAtMs >= previous.frames.at(-1)!.receivedAtMs, '原始帧时间不能逆序');
                }
                chunks.add({ ownerId, id, chunkIndex, frames: frozen } satisfies StoredChunk);
                sessions.put({ ...stored, chunkSizes: [...stored.chunkSizes, frozen.length] });
                done();
              } catch (error) { fail(error); }
            };
            if (chunkIndex === 0) commit(null);
            else {
              const previous = chunks.get([ownerId, id, chunkIndex - 1]);
              previous.onsuccess = () => commit(previous.result ?? null);
            }
          } catch (error) { fail(error); }
        };
      });
    },
    async finish(id: string, result: ArchiveResult): Promise<void> {
      validateResult(result); const frozen = clone(result);
      await mutate(id, (entry) => finishArchiveEntry(entry, frozen));
    },
    async annotate(id: string, expectedLabels: string[]): Promise<void> {
      const frozen = [...expectedLabels];
      await mutate(id, (entry) => annotateArchiveEntry(entry, frozen));
    },
    async setTrainingIncluded(id: string, included: boolean): Promise<void> {
      await mutate(id, (entry) => setArchiveTrainingIncluded(entry, included));
    },
    list,
    read,
    async exportBundle(): Promise<string> { return serializeArchiveBundle(ownerId, await list()); },
    async importBundle(text: string, options: ArchiveImportOptions = {}): Promise<{ imported: number; skipped: number }> {
      // Parsing, hash checks, and all asynchronous work finish before the write transaction opens.
      const incoming = await parseArchiveBundle(text, ownerId, options);
      return transaction(await open(), 'readwrite', (tx, done, fail) => {
        readAllInTransaction(tx, ownerId, (existing) => {
          try {
            const plan = planArchiveImport(existing, incoming, ownerId);
            for (const entry of plan.entries) {
              tx.objectStore('sessions').add(header(entry));
              let offset = 0;
              entry.chunkSizes.forEach((size, chunkIndex) => {
                tx.objectStore('chunks').add({ ownerId, id: entry.meta.id, chunkIndex, frames: entry.rawFrames.slice(offset, offset + size) } satisfies StoredChunk);
                offset += size;
              });
            }
            done({ imported: plan.entries.length, skipped: plan.skipped });
          } catch (error) { fail(error); }
        }, fail);
      });
    },
  };
}
