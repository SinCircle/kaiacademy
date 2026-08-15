"use client";

const STORAGE_PREFIX = "gaiyuan:data-cache:v1:";

type CacheEntry<T> = {
  etag?: string;
  storedAt: number;
  value: T;
};

type CacheOptions<T> = {
  onUpdate?: (value: T) => void;
  revalidate?: boolean;
};

export class ClientFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ClientFetchError";
    this.status = status;
  }
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();
const updateListeners = new Map<string, Set<(value: unknown) => void>>();

function storageKey(url: string) {
  return `${STORAGE_PREFIX}${url}`;
}

function readEntry<T>(url: string): CacheEntry<T> | null {
  const memory = memoryCache.get(url) as CacheEntry<T> | undefined;
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.sessionStorage.getItem(storageKey(url));
    if (!serialized) return null;
    const entry = JSON.parse(serialized) as CacheEntry<T>;
    if (!Number.isFinite(entry.storedAt)) return null;
    memoryCache.set(url, entry as CacheEntry<unknown>);
    return entry;
  } catch {
    return null;
  }
}

function writeEntry<T>(url: string, value: T, etag?: string) {
  const entry: CacheEntry<T> = { etag, storedAt: Date.now(), value };
  memoryCache.set(url, entry as CacheEntry<unknown>);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(url), JSON.stringify(entry));
  } catch {
    // Memory caching remains available when browser storage is unavailable or full.
  }
}

async function requestJson<T>(url: string): Promise<T> {
  const existing = pendingRequests.get(url) as Promise<T> | undefined;
  if (existing) return existing;
  const cached = readEntry<T>(url);
  const request = fetch(url, {
    cache: "no-store",
    headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
  })
    .then(async (response) => {
      if (response.status === 304 && cached) {
        writeEntry(url, cached.value, cached.etag);
        return cached.value;
      }
      const data = await response.json() as T & { message?: string };
      if (!response.ok) throw new ClientFetchError(data.message ?? "读取失败", response.status);
      writeEntry(url, data, response.headers.get("etag") ?? undefined);
      return data;
    })
    .finally(() => pendingRequests.delete(url));
  pendingRequests.set(url, request as Promise<unknown>);
  return request;
}

export async function getCachedJson<T>(url: string, options: CacheOptions<T>): Promise<T> {
  if (options.onUpdate) {
    const listeners = updateListeners.get(url) ?? new Set<(value: unknown) => void>();
    listeners.add(options.onUpdate as (value: unknown) => void);
    updateListeners.set(url, listeners);
  }
  const cached = readEntry<T>(url);
  if (!cached) return requestJson<T>(url);
  if (options.revalidate !== false) {
    void requestJson<T>(url).then((value) => options.onUpdate?.(value)).catch(() => undefined);
  }
  return cached.value;
}

export async function refreshCachedJson<T>(url: string) {
  return requestJson<T>(url);
}

export function setCachedJson<T>(url: string, value: T) {
  writeEntry(url, value);
}

export function invalidateClientCache(prefixes: string | string[]) {
  const targets = Array.isArray(prefixes) ? prefixes : [prefixes];
  const affectedUrls = [...updateListeners.keys()].filter((url) => targets.some((prefix) => url.startsWith(prefix)));
  for (const key of [...memoryCache.keys()]) {
    if (targets.some((prefix) => key.startsWith(prefix))) memoryCache.delete(key);
  }
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const url = key.slice(STORAGE_PREFIX.length);
      if (targets.some((prefix) => url.startsWith(prefix))) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage cleanup is best-effort; in-memory entries were already removed.
  }
  for (const url of affectedUrls) {
    void requestJson(url).then((value) => {
      for (const listener of updateListeners.get(url) ?? []) listener(value);
    }).catch(() => undefined);
  }
}

export function clearClientCache() {
  memoryCache.clear();
  pendingRequests.clear();
  updateListeners.clear();
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage cleanup is best-effort.
  }
}
