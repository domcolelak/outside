import { describe, expect, it } from "vitest";
import { readLimitedJson, RequestBodyError } from "./body";

const request = (body: BodyInit, contentType?: string) => new Request("https://outside.example/api/test", { method: "POST", body, headers: contentType ? { "content-type": contentType } : {} }) as never;

describe("bounded request bodies", () => {
  it("accepts JSON and SCIM JSON media types", async () => {
    await expect(readLimitedJson(request('{"ok":true}', "application/json; charset=utf-8"), 100)).resolves.toEqual({ ok: true });
    await expect(readLimitedJson(request('{"ok":true}', "application/scim+json"), 100)).resolves.toEqual({ ok: true });
  });
  it("rejects missing or unrelated media types", async () => {
    await expect(readLimitedJson(request("{}"), 100)).rejects.toMatchObject({ status: 415 } satisfies Partial<RequestBodyError>);
    await expect(readLimitedJson(request("x", "text/plain"), 100)).rejects.toMatchObject({ status: 415 } satisfies Partial<RequestBodyError>);
  });
  it("rejects streamed overflow and invalid UTF-8", async () => {
    await expect(readLimitedJson(request('{"value":"oversize"}', "application/json"), 8)).rejects.toMatchObject({ status: 413 } satisfies Partial<RequestBodyError>);
    await expect(readLimitedJson(request(new Uint8Array([0xc3, 0x28]), "application/json"), 8)).rejects.toMatchObject({ status: 400 } satisfies Partial<RequestBodyError>);
  });
});

