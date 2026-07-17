import type { AuthStore, Invite, Membership, Organization, Role, User } from "./model";
import { hashInviteToken, inviteExpiresAt } from "./invites";
import { slugifyOrganization } from "./validation";
import { randomUUID } from "node:crypto";

/** Zero-config in-memory auth store. Resets on restart — durable path is Prisma. */
export class InMemoryAuthStore implements AuthStore {
  readonly durable = false;
  private users = new Map<string, User>(); // id -> user
  private byEmail = new Map<string, string>(); // email -> id
  private orgs = new Map<string, Organization>();
  private memberships: Membership[] = [];
  private invites: Array<Invite & { tokenHash: string }> = [];
  private passwordResets: Array<{ userId: string; tokenHash: string; expiresAt: string; usedAt: string | null }> = [];

  private publicInvite(invite: Invite & { tokenHash: string }): Invite {
    const { tokenHash: _tokenHash, ...safe } = invite;
    return safe;
  }

  private id(p: string) {
    return `${p}_${randomUUID()}`;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const id = this.byEmail.get(email.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string; emailVerified?: boolean }) {
    const email = input.email.toLowerCase();
    const user: User = { id: this.id("usr"), email, name: input.name, passwordHash: input.passwordHash, emailVerifiedAt: input.emailVerified ? new Date().toISOString() : null, sessionVersion: 0, createdAt: new Date().toISOString() };
    const org: Organization = { id: this.id("org"), name: input.orgName, slug: slugifyOrganization(input.orgName), plan: "free", createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    this.orgs.set(org.id, org);
    this.memberships.push({ userId: user.id, orgId: org.id, role: "owner", notifyChanges: true, active: true, provisionedBy: null });
    return { user, org };
  }

  async markEmailVerified(userId: string, email: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || user.email !== email.toLowerCase()) return false;
    user.emailVerifiedAt = new Date().toISOString();
    return true;
  }

  async revokeSessions(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user) return 0;
    user.sessionVersion += 1;
    return user.sessionVersion;
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const now = new Date().toISOString();
    for (const reset of this.passwordResets) if (reset.userId === userId && !reset.usedAt) reset.usedAt = now;
    this.passwordResets.push({ userId, tokenHash, expiresAt: expiresAt.toISOString(), usedAt: null });
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    const reset = this.passwordResets.find((item) => item.tokenHash === tokenHash && !item.usedAt && new Date(item.expiresAt) > now);
    if (!reset) return false;
    const user = this.users.get(reset.userId);
    if (!user) return false;
    reset.usedAt = now.toISOString();
    user.passwordHash = passwordHash;
    user.sessionVersion += 1;
    return true;
  }

  async membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role; notifyChanges: boolean }>> {
    return this.memberships
      .filter((m) => m.userId === userId && m.active)
      .map((m) => ({ org: this.orgs.get(m.orgId)!, role: m.role, notifyChanges: m.notifyChanges }))
      .filter((m) => m.org);
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    return this.memberships.find((m) => m.userId === userId && m.orgId === orgId && m.active) ?? null;
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    return this.orgs.get(orgId) ?? null;
  }

  async orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role; notifyChanges: boolean }>> {
    return this.memberships
      .filter((m) => m.orgId === orgId && m.active)
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
      this.memberships.push({ userId, orgId: invite.orgId, role: invite.role, notifyChanges: true, active: true, provisionedBy: null });
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

  async provisionMembership(input: { email: string; name: string; passwordHash: string; orgId: string; role: Role; provisionedBy: string; active: boolean }) {
    const email = input.email.toLowerCase(); let user = await this.findUserByEmail(email);
    if (!user) { user = { id: this.id("usr"), email, name: input.name, passwordHash: input.passwordHash, emailVerifiedAt: new Date().toISOString(), sessionVersion: 0, createdAt: new Date().toISOString() }; this.users.set(user.id, user); this.byEmail.set(email, user.id); }
    let membership = this.memberships.find((item) => item.userId === user!.id && item.orgId === input.orgId);
    if (!membership) { membership = { userId: user.id, orgId: input.orgId, role: input.role, notifyChanges: true, active: input.active, provisionedBy: input.provisionedBy }; this.memberships.push(membership); }
    else { membership.active = input.active; membership.role = input.role; membership.provisionedBy = input.provisionedBy; }
    return { user, membership };
  }

  async setProvisionedMembershipActive(userId: string, orgId: string, provisionedBy: string, active: boolean) { const membership = this.memberships.find((item) => item.userId === userId && item.orgId === orgId && item.provisionedBy === provisionedBy); if (!membership) return false; membership.active = active; if (!active) await this.revokeSessions(userId); return true; }
}
