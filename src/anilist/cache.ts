interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<K, V> {
  private store = new Map<string, CacheEntry<V>>();
  constructor(private ttlMs: number, private keyFn: (k: K) => string = (k) => String(k)) {}

  get(key: K): V | undefined {
    const k = this.keyFn(key);
    const entry = this.store.get(k);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(k);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.set(this.keyFn(key), { value, expiresAt: Date.now() + this.ttlMs });
  }
}
