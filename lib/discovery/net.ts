/** Bounded, timed fetch helper for passive discovery providers. */

export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 8000, headers } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "OUTSIDE-external-surface/0.1 (+https://outside.example/about)", ...headers },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with bounded concurrency; failures are isolated per task. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; value?: R; error?: unknown }>> {
  const results: Array<{ item: T; value?: R; error?: unknown }> = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx] as T;
      try {
        results[idx] = { item, value: await fn(item) };
      } catch (error) {
        results[idx] = { item, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
