export interface TransactionRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export function isRetryablePostgresTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const meta = candidate.meta && typeof candidate.meta === "object"
    ? candidate.meta as { code?: unknown }
    : null;
  const databaseCode = typeof meta?.code === "string" ? meta.code : "";
  return code === "P2034" || (code === "P2010" && (databaseCode === "40001" || databaseCode === "40P01"));
}

export async function retryPostgresTransaction<T>(
  operation: () => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 10);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 160);
  const jitterMs = Math.max(0, options.jitterMs ?? 10);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryablePostgresTransactionError(error) || attempt === maxAttempts - 1) throw error;
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      await sleep(exponentialDelay + jitter);
    }
  }
  throw new Error("PostgreSQL transaction retry loop exhausted.");
}
