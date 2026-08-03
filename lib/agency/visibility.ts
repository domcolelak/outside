import type {
  AgencyActivity,
  AgencyClient,
  AgencyClientView,
  AgencyNote,
  AgencyRole,
} from "./types";
import { hasAgencyPermission } from "./types";

export const AGENCY_CLIENT_BILLING_FIELDS = [
  "billingMode",
  "monthlyPriceCents",
  "currency",
] as const;

function omitKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

export function canViewAgencyBilling(role: AgencyRole): boolean {
  return hasAgencyPermission(role, "billing:manage");
}

export function containsAgencyBillingFields(
  value: Record<string, unknown>,
): boolean {
  return AGENCY_CLIENT_BILLING_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(value, field),
  );
}

export function visibleAgencyClient(
  client: AgencyClient,
  role: AgencyRole,
): AgencyClientView {
  return canViewAgencyBilling(role)
    ? client
    : omitKeys(client, AGENCY_CLIENT_BILLING_FIELDS);
}

export function visibleAgencyClients(
  clients: AgencyClient[],
  role: AgencyRole,
): AgencyClientView[] {
  return clients.map((client) => visibleAgencyClient(client, role));
}

export function visibleAgencyActivity(
  activity: AgencyActivity[],
  role: AgencyRole,
): AgencyActivity[] {
  return canViewAgencyBilling(role)
    ? activity
    : activity.filter((item) => !item.type.startsWith("billing."));
}

export function visibleAgencyAnalytics<
  T extends {
    billing: unknown;
    reseller: {
      children: Array<Record<string, unknown> & { revenueByCurrency: unknown }>;
    };
  },
>(analytics: T, role: AgencyRole) {
  if (canViewAgencyBilling(role)) return analytics;
  const operational = omitKeys(analytics, ["billing"] as const);
  return {
    ...operational,
    reseller: {
      ...analytics.reseller,
      children: analytics.reseller.children.map((child) =>
        omitKeys(child, ["revenueByCurrency"] as const),
      ),
    },
  };
}

export function visibleAgencyNotes(
  notes: AgencyNote[],
  role: AgencyRole,
): AgencyNote[] {
  return role === "viewer"
    ? notes.filter((note) => note.visibility === "shared")
    : notes;
}
