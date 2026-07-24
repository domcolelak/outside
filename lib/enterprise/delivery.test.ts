import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpMocks = vi.hoisted(() => ({
  request: vi.fn(async () => ({ status: 204, headers: {}, body: "" })),
}));

vi.mock("./http", () => ({
  safeEnterpriseRequest: httpMocks.request,
}));

import { encryptEnterpriseSecret } from "./crypto";
import { deliverEnterpriseBatch } from "./delivery";
import { InMemoryEnterpriseStore } from "./memory-store";
import type { EnterpriseIntegration } from "./types";

describe("enterprise delivery leasing", () => {
  beforeEach(() => {
    process.env.ENTERPRISE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    httpMocks.request.mockClear();
  });

  afterEach(() => {
    delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  });

  it("claims and renews one delivery immediately before each external request", async () => {
    const store = new InMemoryEnterpriseStore();
    const workspace = await store.provision({ orgId: "delivery-org", ownerUserId: "owner" });
    const integration = await store.create<EnterpriseIntegration>(workspace.id, "integrations", {
      provider: "webhook",
      category: "webhook",
      name: "Webhook",
      enabled: true,
      configEncrypted: encryptEnterpriseSecret({ url: "https://hooks.example.test/outside", signingSecret: "secret" }),
      eventTypes: [],
      severities: [],
      status: "configured",
      lastDeliveryAt: null,
      lastError: null,
      createdBy: "owner",
    });
    const payload = { id: "event", occurredAt: new Date().toISOString(), organizationId: workspace.orgId, type: "finding.changed", severity: "high", title: "Changed", description: "Changed", resource: { type: "finding", id: "finding" }, evidence: {} };
    await store.enqueueDelivery({ workspaceId: workspace.id, integrationId: integration.id, idempotencyKey: "delivery-1", eventId: "event-1", payload });
    await store.enqueueDelivery({ workspaceId: workspace.id, integrationId: integration.id, idempotencyKey: "delivery-2", eventId: "event-2", payload: { ...payload, id: "event-2" } });
    const claim = vi.spyOn(store, "claimDeliveries");
    const renew = vi.spyOn(store, "renewDeliveryLease");

    await expect(deliverEnterpriseBatch(store, 2)).resolves.toEqual({ delivered: 2, failed: 0 });
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls.every((call) => call[1] === 1)).toBe(true);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(httpMocks.request).toHaveBeenCalledTimes(2);
  });
});
