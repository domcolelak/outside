/** Bounded, timed fetch helper for discovery providers. */

export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; signal?: AbortSignal; maxBytes?: number } = {},
): Promise<T> {
  const { timeoutMs = 8_000, headers, maxBytes = 2_000_000 } = opts;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const res = await fetch(url, {
    signal,
    headers: { "user-agent": "OUTSIDE-external-surface/0.1 (+https://outside.example/about)", ...headers },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) throw new Error("Provider returned a non-JSON response.");
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Provider response exceeded the size limit.");
  if (!res.body) throw new Error("Provider returned an empty response.");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("provider response size limit");
        throw new Error("Provider response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(merged)) as T;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<Array<{ item: T; value?: R; error?: unknown }>> {
  const results: Array<{ item: T; value?: R; error?: unknown }> = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      signal?.throwIfAborted();
      const idx = i++;
      const item = items[idx] as T;
      try { results[idx] = { item, value: await fn(item) }; }
      catch (error) { if (signal?.aborted) throw error; results[idx] = { item, error }; }
    }
  });
  await Promise.all(workers);
  return results;
}
