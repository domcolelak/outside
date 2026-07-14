import { describe, expect, it } from "vitest";
import { __resetWebhookEvents, processWebhookOnce } from "./idempotency";

describe("webhook idempotency (in-memory fallback)", () => {
  it("returns true once per event id, false thereafter", async () => {
    const id = `evt_${Math.random()}`;
    __resetWebhookEvents();
    expect(await processWebhookOnce(id, async () => {})).toBe("processed");
    expect(await processWebhookOnce(id, async () => {})).toBe("duplicate");
    expect(await processWebhookOnce(id, async () => {})).toBe("duplicate");
  });

  it("does not mark failed work complete", async () => {
    __resetWebhookEvents();
    await expect(processWebhookOnce("evt_retry", async () => { throw new Error("transient"); })).rejects.toThrow("transient");
    expect(await processWebhookOnce("evt_retry", async () => {})).toBe("processed");
  });
});
