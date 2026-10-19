interface EmergencyCapture { id: string; payload: string }
// Survives route changes. Session storage is best effort: disk quota failures
// must never be described as a durable backup. Download remains necessary.
const memory = new Map<string, EmergencyCapture[]>();
const listeners = new Map<string, Set<(records: EmergencyCapture[]) => void>>();
const key = (owner: string) => `darklo-gesture-emergency:${owner}`;

export function pendingEmergencyCaptures(owner: string): EmergencyCapture[] {
  if (!memory.has(owner)) {
    let records: EmergencyCapture[] = [];
    try {
      const restored: unknown = JSON.parse(sessionStorage.getItem(key(owner)) ?? '[]');
      if (Array.isArray(restored)) records = restored.filter(r => r && typeof r.id === 'string' && typeof r.payload === 'string');
    } catch { /* memory remains available even if browser storage is unavailable */ }
    memory.set(owner, records);
  }
  return memory.get(owner)!.map(record => ({ ...record }));
}

export function retainEmergencyCapture(owner: string, id: string, payload: string): void {
  const records = pendingEmergencyCaptures(owner);
  if (!records.some(record => record.id === id && record.payload === payload)) records.push({ id, payload });
  memory.set(owner, records);
  try { sessionStorage.setItem(key(owner), JSON.stringify(records)); } catch { /* preserve the in-memory copy */ }
  listeners.get(owner)?.forEach(listener => listener(pendingEmergencyCaptures(owner)));
}

export function subscribeEmergencyCaptures(owner: string, listener: (records: EmergencyCapture[]) => void): () => void {
  const subscriptions = listeners.get(owner) ?? new Set();
  subscriptions.add(listener);
  listeners.set(owner, subscriptions);
  listener(pendingEmergencyCaptures(owner));
  return () => { subscriptions.delete(listener); if (!subscriptions.size) listeners.delete(owner); };
}
