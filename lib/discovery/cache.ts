interface CacheEntry<T> { value: T; expiresAt: number }

/** Small process-local cache for short-lived public provider observations. */
export class BoundedTtlCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.values.delete(key);
      return undefined;
    }
    // Refresh insertion order so eviction approximates LRU.
    this.values.delete(key);
    this.values.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.ttlMs <= 0 || this.maxEntries <= 0) return;
    this.values.delete(key);
    while (this.values.size >= this.maxEntries) this.values.delete(this.values.keys().next().value as string);
    this.values.set(key, { value: structuredClone(value), expiresAt: now + this.ttlMs });
  }

  clear(): void { this.values.clear(); }
  get size(): number { return this.values.size; }
}
