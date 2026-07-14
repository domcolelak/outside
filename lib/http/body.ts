import type { NextRequest } from "next/server";

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Rejects declared oversize bodies before reading, then enforces the limit while streaming. */
export async function readLimitedJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyError("Payload too large", 413);
  if (!req.body) throw new RequestBodyError("Missing request body", 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("payload limit exceeded");
        throw new RequestBodyError("Payload too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(merged)) as unknown;
  } catch {
    throw new RequestBodyError("Invalid JSON", 400);
  }
}
