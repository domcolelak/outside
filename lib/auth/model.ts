/**
 * Accounts, organizations, and role-based access.
 *
 * Deliberately lean RBAC: a user belongs to organizations through memberships,
 * each carrying one role. Roles are a strict hierarchy so permission checks are
 * a single comparison — no per-resource ACL matrix (that would be fake
 * enterprise complexity for this product).
 */

export type Role = "owner" | "admin" | "analyst" | "viewer";

export const ROLE_RANK: Record<Role, number> = { owner: 3, admin: 2, analyst: 1, viewer: 0 };

/** True if `role` meets or exceeds `min` in the hierarchy. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "professional" | "agency";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  createdAt: string;
}

export interface Membership {
  userId: string;
  orgId: string;
  role: Role;
}

/** A user with the organizations they can access (for the session context). */
export interface SessionContext {
  user: Omit<User, "passwordHash">;
  memberships: Array<{ org: Organization; role: Role }>;
}

export interface AuthStore {
  readonly durable: boolean;
  findUserByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  /** Create a user together with a personal organization + owner membership. */
  createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string }): Promise<{ user: User; org: Organization }>;
  membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role }>>;
  getMembership(userId: string, orgId: string): Promise<Membership | null>;
  /** Members of an organization (for notifications). */
  orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role }>>;
  setPlan(orgId: string, plan: Organization["plan"]): Promise<void>;
  /** Look up an org by its Stripe customer id (billing webhooks). */
  findOrgByStripeCustomer?(customerId: string): Promise<Organization | null>;
  setSubscription?(orgId: string, data: { plan: Organization["plan"]; stripeCustomerId?: string; stripeSubscriptionId?: string | null; status?: string | null }): Promise<void>;
}
