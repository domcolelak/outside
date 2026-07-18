import { describe, expect, it } from "vitest";
import { billingEventIsNewer, billingEventRank } from "./order";

describe("Stripe event ordering", () => {
  it("rejects delayed events and gives cancellation precedence at the same timestamp", () => {
    expect(billingEventIsNewer({ created: 200, rank: 20 }, { created: 199, rank: 40 })).toBe(false);
    expect(billingEventIsNewer({ created: 200, rank: billingEventRank("customer.subscription.updated") }, { created: 200, rank: billingEventRank("customer.subscription.deleted") })).toBe(true);
    expect(billingEventIsNewer({ created: 200, rank: billingEventRank("customer.subscription.deleted") }, { created: 200, rank: billingEventRank("customer.subscription.updated") })).toBe(false);
  });
});

