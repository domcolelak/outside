import type { AuthStore, Invite, Membership, Organization, Role, User } from "./model";
import { hashInviteToken, inviteExpiresAt } from "./invites";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
}

/** Zero-config in-memory auth store. Resets on restart — durable path is Prisma. */
export class InMemoryAuthStore implements AuthStore {
  readonly durable = false;
  private users = new Map<string, User>(); // id -> user
  private byEmail = new Map<string, string>(); // email -> id
  private orgs = new Map<string, Organization>();
  private memberships: Membership[] = [];
  private invites: Array<Invite & { tokenHash: string }> = [];

  private publicInvite(invite: Invite & { tokenHash: string }): Invite {
    const { tokenHash: _tokenHash, ...safe } = invite;
    return safe;
  }

  private id(p: string) {
    return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const id = this.byEmail.get(email.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string }) {
    const email = input.email.toLowerCase();
    const user: User = { id: this.id("usr"), email, name: input.name, passwordHash: input.passwordHash, createdAt: new Date().toISOString() };
    const org: Organization = { id: this.id("org"), name: input.orgName, slug: slugify(input.orgName), plan: "free", createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    this.orgs.set(org.id, org);
    this.memberships.push({ userId: user.id, orgId: org.id, role: "owner", notifyChanges: true });
    return { user, org };
  }

  async membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role; notifyChanges: boolean }>> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map((m) => ({ org: this.orgs.get(m.orgId)!, role: m.role, notifyChanges: m.notifyChanges }))
      .filter((m) => m.org);
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    return this.memberships.find((m) => m.userId === userId && m.orgId === orgId) ?? null;
  }

  async orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role; notifyChanges: boolean }>> {
    return this.memberships
      .filter((m) => m.orgId === orgId)
      .map((m) => {
        const u = this.users.get(m.userId);
        return u ? { email: u.email, name: u.name, role: m.role, notifyChanges: m.notifyChanges } : null;
      })
      .filter((x): x is { email: string; name: string; role: Role; notifyChanges: boolean } => x !== null);
  }

  async setNotifyChanges(userId: string, orgId: string, enabled: boolean): Promise<void> {
    const m = this.memberships.find((x) => x.userId === userId && x.orgId === orgId);
    if (m) m.notifyChanges = enabled;
  }

  async createInvite(orgId: string, email: string, role: Role, token: string, createdBy: string): Promise<Invite> {
    const now = new Date();
    const invite: Invite & { tokenHash: string } = {
      id: this.id("inv"), orgId, email: email.toLowerCase(), role, createdBy,
      tokenHash: hashInviteToken(token), createdAt: now.toISOString(), expiresAt: inviteExpiresAt(now).toISOString(),
      acceptedAt: null, revokedAt: null,
    };
    this.invites.push(invite);
    return this.publicInvite(invite);
  }
  async listInvites(orgId: string): Promise<Invite[]> {
    const now = Date.now();
    return this.invites
      .filter((i) => i.orgId === orgId && !i.acceptedAt && !i.revokedAt && Date.parse(i.expiresAt) > now)
      .map((invite) => this.publicInvite(invite));
  }
  async getInviteByToken(token: string): Promise<Invite | null> {
    const tokenHash = hashInviteToken(token);
    const invite = this.invites.find((i) => i.tokenHash === tokenHash);
    return invite ? this.publicInvite(invite) : null;
  }
  async acceptInvite(token: string, userId: string, userEmail: string): Promise<{ orgId: string; role: Role } | null> {
    const tokenHash = hashInviteToken(token);
    const invite = this.invites.find((i) => i.tokenHash === tokenHash && !i.acceptedAt && !i.revokedAt);
    if (!invite || Date.parse(invite.expiresAt) <= Date.now() || invite.email !== userEmail.toLowerCase()) return null;
    if (!this.memberships.some((m) => m.userId === userId && m.orgId === invite.orgId)) {
      this.memberships.push({ userId, orgId: invite.orgId, role: invite.role, notifyChanges: true });
    }
    invite.acceptedAt = new Date().toISOString();
    return { orgId: invite.orgId, role: invite.role };
  }

  async setPlan(orgId: string, plan: Organization["plan"]): Promise<void> {
    const org = this.orgs.get(orgId);
    if (org) org.plan = plan;
  }

  async findOrgByStripeCustomer(customerId: string): Promise<Organization | null> {
    for (const org of this.orgs.values()) if (org.stripeCustomerId === customerId) return org;
    return null;
  }

  async setSubscription(orgId: string, data: { plan: Organization["plan"]; stripeCustomerId?: string; stripeSubscriptionId?: string | null; status?: string | null }): Promise<void> {
    const org = this.orgs.get(orgId);
    if (!org) return;
    org.plan = data.plan;
    if (data.stripeCustomerId !== undefined) org.stripeCustomerId = data.stripeCustomerId;
    if (data.stripeSubscriptionId !== undefined) org.stripeSubscriptionId = data.stripeSubscriptionId;
    if (data.status !== undefined) org.subscriptionStatus = data.status;
  }
}
