import type { AuthStore, Invite, Membership, Organization, Role, User } from "./model";
import { hashInviteToken, inviteExpiresAt } from "./invites";
import { prisma } from "@/lib/db/prisma";
import { slugifyOrganization } from "./validation";

export class PrismaAuthStore implements AuthStore {
  readonly durable = true;

  async findUserByEmail(email: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return u ? this.mapUser(u) : null;
  }
  async getUser(id: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { id } });
    return u ? this.mapUser(u) : null;
  }

  async createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string; emailVerified?: boolean }) {
    const email = input.email.toLowerCase();
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash: input.passwordHash, emailVerifiedAt: input.emailVerified ? new Date() : null } });
      const org = await tx.organization.create({ data: { name: input.orgName, slug: slugifyOrganization(input.orgName), plan: "free" } });
      await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "owner" } });
      return { user, org };
    });
    return { user: this.mapUser(result.user), org: this.mapOrg(result.org) };
  }

  async markEmailVerified(userId: string, email: string): Promise<boolean> {
    const result = await prisma.user.updateMany({ where: { id: userId, email: email.toLowerCase() }, data: { emailVerifiedAt: new Date() } });
    return result.count === 1;
  }

  async membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role; notifyChanges: boolean }>> {
    const rows = await prisma.membership.findMany({ where: { userId }, include: { org: true } });
    return rows.map((r) => ({ org: this.mapOrg(r.org), role: r.role as Role, notifyChanges: r.notifyChanges }));
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    const m = await prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
    return m ? { userId: m.userId, orgId: m.orgId, role: m.role as Role, notifyChanges: m.notifyChanges } : null;
  }

  async orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role; notifyChanges: boolean }>> {
    const rows = await prisma.membership.findMany({ where: { orgId }, include: { user: true } });
    return rows.map((r) => ({ email: r.user.email, name: r.user.name, role: r.role as Role, notifyChanges: r.notifyChanges }));
  }

  async setNotifyChanges(userId: string, orgId: string, enabled: boolean): Promise<void> {
    await prisma.membership.update({ where: { userId_orgId: { userId, orgId } }, data: { notifyChanges: enabled } });
  }

  async createInvite(orgId: string, email: string, role: Role, token: string, createdBy: string): Promise<Invite> {
    const row = await prisma.invite.create({
      data: { orgId, email: email.toLowerCase(), role, tokenHash: hashInviteToken(token), createdBy, expiresAt: inviteExpiresAt() },
    });
    return this.mapInvite(row);
  }
  async listInvites(orgId: string): Promise<Invite[]> {
    const rows = await prisma.invite.findMany({
      where: { orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.mapInvite(r));
  }
  async getInviteByToken(token: string): Promise<Invite | null> {
    const row = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
    return row ? this.mapInvite(row) : null;
  }
  async acceptInvite(token: string, userId: string, userEmail: string): Promise<{ orgId: string; role: Role } | null> {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
      if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now || invite.email !== userEmail.toLowerCase()) return null;
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) return null;
      await tx.membership.upsert({
        where: { userId_orgId: { userId, orgId: invite.orgId } },
        create: { userId, orgId: invite.orgId, role: invite.role },
        update: {},
      });
      return { orgId: invite.orgId, role: invite.role as Role };
    });
  }

  private mapInvite = (r: { id: string; orgId: string; email: string; role: string; createdBy: string; createdAt: Date; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }): Invite => ({
    id: r.id,
    orgId: r.orgId,
    email: r.email,
    role: r.role as Role,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
  });

  async setPlan(orgId: string, plan: Organization["plan"]): Promise<void> {
    await prisma.organization.update({ where: { id: orgId }, data: { plan } });
  }

  async findOrgByStripeCustomer(customerId: string): Promise<Organization | null> {
    const o = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId } });
    return o ? this.mapOrg(o) : null;
  }

  async setSubscription(orgId: string, data: { plan: Organization["plan"]; stripeCustomerId?: string; stripeSubscriptionId?: string | null; status?: string | null }): Promise<void> {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: data.plan,
        ...(data.stripeCustomerId !== undefined ? { stripeCustomerId: data.stripeCustomerId } : {}),
        ...(data.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: data.stripeSubscriptionId } : {}),
        ...(data.status !== undefined ? { subscriptionStatus: data.status } : {}),
      },
    });
  }

  private mapUser = (u: { id: string; email: string; name: string; passwordHash: string; emailVerifiedAt: Date | null; createdAt: Date }): User => ({
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  });
  private mapOrg = (o: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    createdAt: Date;
  }): Organization => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: (o.plan as Organization["plan"]) ?? "free",
    stripeCustomerId: o.stripeCustomerId ?? null,
    stripeSubscriptionId: o.stripeSubscriptionId ?? null,
    subscriptionStatus: o.subscriptionStatus ?? null,
    createdAt: o.createdAt.toISOString(),
  });
}
