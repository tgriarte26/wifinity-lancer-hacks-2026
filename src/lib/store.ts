import { useSyncExternalStore } from "react";

// Tiny global store: createStore(initial) -> [useValue, set, get].
export function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  const get = () => value;
  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    subs.forEach((fn) => fn());
  };
  const subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };
  const use = () => useSyncExternalStore(subscribe, get, get);
  return [use, set, get] as const;
}

// Saved values survive restarts. Storage can fail, so the app never depends on it.
export function loadSaved<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
