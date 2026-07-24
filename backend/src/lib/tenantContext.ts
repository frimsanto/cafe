import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  cafeId: string;
}

// Konteks tenant per-permintaan. AsyncLocalStorage menjaga nilai tetap terikat
// pada satu rantai permintaan meski melewati banyak await.
const storage = new AsyncLocalStorage<TenantStore>();

/** Jalankan `fn` di dalam konteks tenant tertentu. */
export function runWithTenant<T>(cafeId: string, fn: () => T): T {
  return storage.run({ cafeId }, fn);
}

/** Kafe aktif pada permintaan saat ini; `undefined` bila di luar konteks. */
export function getTenantId(): string | undefined {
  return storage.getStore()?.cafeId;
}
