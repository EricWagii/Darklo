const RUNTIME_BUSY_SOURCES_KEY = '__emgRuntimeBusySources';
const RUNTIME_BUSY_KEY = '__emgRuntimeBusy';

declare global {
  interface Window {
    __emgRuntimeBusySources?: Set<string>;
    __emgRuntimeBusy?: boolean;
  }
}

const getBusySources = (): Set<string> | null => {
  if (typeof window === 'undefined') return null;
  if (!window[RUNTIME_BUSY_SOURCES_KEY]) {
    window[RUNTIME_BUSY_SOURCES_KEY] = new Set<string>();
  }
  return window[RUNTIME_BUSY_SOURCES_KEY] ?? null;
};

export const setEmgRuntimeBusy = (source: string, busy: boolean): void => {
  const sources = getBusySources();
  if (!sources || !source) return;

  if (busy) {
    sources.add(source);
  } else {
    sources.delete(source);
  }

  window[RUNTIME_BUSY_KEY] = sources.size > 0;
};

export const isEmgRuntimeBusy = (): boolean => {
  const sources = getBusySources();
  return Boolean(sources?.size);
};
