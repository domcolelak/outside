import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    $executeRaw: mocks.execute,
  },
}));

vi.mock("./provider", () => ({
  getEmailProvider: () => ({ kind: "console", send: mocks.send }),
}));

import { deliverOutboxBatch } from "./outbox";

const row = (id: string) => ({ id, to: `${id}@example.test`, subject: id, html: `<p>${id}</p>`, text: id, attempts: 1 });

describe("email outbox leasing", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://unit-test";
    delete process.env.OUTSIDE_STORAGE_MODE;
    mocks.query.mockReset();
    mocks.execute.mockReset();
    mocks.send.mockReset();
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("claims each message immediately before sending with a fresh renewable lease", async () => {
    mocks.query.mockResolvedValueOnce([row("one")]).mockResolvedValueOnce([row("two")]);
    mocks.execute.mockResolvedValue(1);
    const result = await deliverOutboxBatch(2);
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0]![1]).not.toBe(mocks.query.mock.calls[1]![1]);
    expect(String(mocks.query.mock.calls[0]![0])).toContain("'sending'");
  });

  it("does not send after the lease-renewal CAS loses ownership", async () => {
    mocks.query.mockResolvedValueOnce([row("lost")]);
    mocks.execute.mockResolvedValueOnce(0);
    await expect(deliverOutboxBatch(1)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
