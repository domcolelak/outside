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
  emailVerifiedAt: string | null;
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
  notifyChanges: boolean;
}

export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

/** A user with the organizations they can access (for the session context). */
export interface SessionContext {
  user: Omit<User, "passwordHash">;
  memberships: Array<{ org: Organization; role: Role; notifyChanges: boolean }>;
}

export interface AuthStore {
  readonly durable: boolean;
  findUserByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  /** Create a user together with a personal organization + owner membership. */
  createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string; emailVerified?: boolean }): Promise<{ user: User; org: Organization }>;
  markEmailVerified(userId: string, email: string): Promise<boolean>;
  membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role; notifyChanges: boolean }>>;
  getMembership(userId: string, orgId: string): Promise<Membership | null>;
  /** Members of an organization (for notifications). */
  orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role; notifyChanges: boolean }>>;
  setNotifyChanges(userId: string, orgId: string, enabled: boolean): Promise<void>;
  setPlan(orgId: string, plan: Organization["plan"]): Promise<void>;
  // Team invites.
  createInvite(orgId: string, email: string, role: Role, token: string, createdBy: string): Promise<Invite>;
  listInvites(orgId: string): Promise<Invite[]>;
  getInviteByToken(token: string): Promise<Invite | null>;
  /** Accept an invite: add membership + mark accepted. Returns the org/role, or null. */
  acceptInvite(token: string, userId: string, userEmail: string): Promise<{ orgId: string; role: Role } | null>;
  /** Look up an org by its Stripe customer id (billing webhooks). */
  findOrgByStripeCustomer?(customerId: string): Promise<Organization | null>;
  setSubscription?(orgId: string, data: { plan: Organization["plan"]; stripeCustomerId?: string; stripeSubscriptionId?: string | null; status?: string | null }): Promise<void>;
}
