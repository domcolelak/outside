export function billingEventRank(type: string): number {
  if (type === "customer.subscription.deleted") return 40;
  if (type === "invoice.payment_failed") return 30;
  if (type === "customer.subscription.updated") return 20;
  if (type === "checkout.session.completed") return 10;
  return 0;
}

export function billingEventIsNewer(current: { created: number | null; rank: number }, incoming: { created: number; rank: number }): boolean {
  return current.created === null || incoming.created > current.created || incoming.created === current.created && incoming.rank > current.rank;
}

