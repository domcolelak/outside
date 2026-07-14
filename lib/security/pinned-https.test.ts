import { EventEmitter } from "node:events";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { pinnedHttpsGet } from "./pinned-https";

describe("pinnedHttpsGet", () => {
  it("rejects mixed public/private resolutions before connecting", async () => {
    const spy = vi.spyOn(https, "request");
    await expect(pinnedHttpsGet("example.com", ["93.184.216.34", "127.0.0.1"], { path: "/" })).rejects.toThrow(/public/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("pins the socket while retaining hostname validation", async () => {
    const req = new EventEmitter() as EventEmitter & { setTimeout: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    req.setTimeout = vi.fn();
    req.end = vi.fn();
    const spy = vi.spyOn(https, "request").mockImplementation(((options: https.RequestOptions, callback: (res: unknown) => void) => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: ReturnType<typeof vi.fn> };
      res.statusCode = 200;
      res.headers = { server: "test" };
      res.destroy = vi.fn();
      queueMicrotask(() => callback(res));
      return req;
    }) as unknown as typeof https.request);

    const response = await pinnedHttpsGet("example.com", ["93.184.216.34"], { path: "/", maxBodyBytes: 0 });
    const options = spy.mock.calls[0]![0] as https.RequestOptions;
    expect(options.hostname).toBe("93.184.216.34");
    expect(options.servername).toBe("example.com");
    expect(options.headers).toMatchObject({ host: "example.com" });
    expect(response.status).toBe(200);
    spy.mockRestore();
  });
});
