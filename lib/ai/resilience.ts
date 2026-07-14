/**
 * Resilience primitives for the AI provider seam — ported from Aegis AI's
 * RateLimitedProvider(RetryingProvider(...)) composition. A semaphore bounds
 * concurrent in-flight requests; transient failures (429 / 5xx / network) are
 * retried with full-jitter exponential backoff, while auth/validation errors
 * surface immediately (a tool that summarizes must not amplify a rate limit).
 */

export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number, private readonly maxQueue = 32, private readonly queueTimeoutMs = 10_000) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.queue.length >= this.maxQueue) throw new Error("AI concurrency queue is full");
      await new Promise<void>((resolve, reject) => {
        const release = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = this.queue.indexOf(release);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new Error("AI concurrency queue timed out"));
        }, this.queueTimeoutMs);
        this.queue.push(release);
      });
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export async function retryTransient<T>(
  fn: () => Promise<T>,
  isTransient: (err: unknown) => boolean,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 4, baseDelay = 500, maxDelay = 8000 } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      const window = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, Math.random() * window)); // full jitter
    }
  }
}

/** HTTP transient classification: rate limits, server errors, and network faults. */
export function isTransientHttp(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return true; // no status = network/abort error → transient
}
