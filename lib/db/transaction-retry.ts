export interface TransactionRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

/** The Postgres SQLSTATE, wherever the client put it. Prisma's engine reported
 * it under meta.code; the driver-adapter runtime nests it as
 * meta.driverAdapterError.cause.originalCode for wrapped raw-query errors and
 * as cause.originalCode on errors it rethrows without a Prisma code. */
function sqlState(candidate: { meta?: unknown; cause?: unknown }): string {
  const meta = candidate.meta && typeof candidate.meta === "object"
    ? candidate.meta as { code?: unknown; driverAdapterError?: unknown }
    : null;
  if (typeof meta?.code === "string") return meta.code;
  for (const wrapper of [meta?.driverAdapterError, candidate]) {
    const cause = wrapper && typeof wrapper === "object" ? (wrapper as { cause?: unknown }).cause : null;
    const original = cause && typeof cause === "object" ? (cause as { originalCode?: unknown }).originalCode : null;
    if (typeof original === "string") return original;
  }
  return "";
}

export function isRetryablePostgresTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: unknown; cause?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "P2034") return true;
  return RETRYABLE_SQLSTATES.has(sqlState(candidate)) && (code === "P2010" || code === "");
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
