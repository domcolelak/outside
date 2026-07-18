import type { AuthStore, Invite, Membership, Organization, Role, User } from "./model";
import { hashInviteToken, inviteExpiresAt } from "./invites";
import { prisma } from "@/lib/db/prisma";
import { slugifyOrganization } from "./validation";
import { randomUUID } from "node:crypto";

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

  async revokeSessions(userId: string): Promise<number> {
    const user = await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
    return user.sessionVersion;
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE password_reset_tokens SET "usedAt"=NOW() WHERE "userId"=${userId} AND "usedAt" IS NULL`;
      await tx.$executeRaw`INSERT INTO password_reset_tokens (id,"userId","tokenHash","expiresAt","createdAt") VALUES (${randomUUID()},${userId},${tokenHash},${expiresAt},NOW())`;
    });
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ userId: string }>>`
        UPDATE password_reset_tokens SET "usedAt"=${now}
        WHERE id=(SELECT id FROM password_reset_tokens WHERE "tokenHash"=${tokenHash} AND "usedAt" IS NULL AND "expiresAt">${now} FOR UPDATE)
        RETURNING "userId"
      `;
      const userId = rows[0]?.userId;
      if (!userId) return false;
      const changed = await tx.user.updateMany({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new Error("Password reset user is missing.");
      await tx.$executeRaw`UPDATE password_reset_tokens SET "usedAt"=${now} WHERE "userId"=${userId} AND "usedAt" IS NULL`;
      return true;
    });
  }

  async membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role; notifyChanges: boolean }>> {
    const rows = await prisma.$queryRaw<Array<{ role: string; notifyChanges: boolean; id: string; name: string; slug: string; plan: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null; subscriptionStatus: string | null; createdAt: Date }>>`SELECT m.role,m."notifyChanges",o.* FROM memberships m JOIN organizations o ON o.id=m."orgId" WHERE m."userId"=${userId} AND m.active=true`;
    return rows.map((r) => ({ org: this.mapOrg(r), role: r.role as Role, notifyChanges: r.notifyChanges }));
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    const rows = await prisma.$queryRaw<Array<{ userId: string; orgId: string; role: string; notifyChanges: boolean; active: boolean; provisionedBy: string | null }>>`SELECT * FROM memberships WHERE "userId"=${userId} AND "orgId"=${orgId} AND active=true LIMIT 1`; const m = rows[0];
    return m ? { userId: m.userId, orgId: m.orgId, role: m.role as Role, notifyChanges: m.notifyChanges, active: m.active, provisionedBy: m.provisionedBy } : null;
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    const row = await prisma.organization.findUnique({ where: { id: orgId } });
    return row ? this.mapOrg(row) : null;
  }

  async orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role; notifyChanges: boolean }>> {
    const rows = await prisma.$queryRaw<Array<{ email: string; name: string; role: string; notifyChanges: boolean }>>`SELECT u.email,u.name,m.role,m."notifyChanges" FROM memberships m JOIN users u ON u.id=m."userId" WHERE m."orgId"=${orgId} AND m.active=true`;
    return rows.map((r) => ({ email: r.email, name: r.name, role: r.role as Role, notifyChanges: r.notifyChanges }));
  }

  async setNotifyChanges(userId: string, orgId: string, enabled: boolean): Promise<void> {
    await prisma.membership.update({ where: { userId_orgId: { userId, orgId } }, data: { notifyChanges: enabled } });
  }

  async provisionMembership(input: { email: string; name: string; passwordHash: string; orgId: string; role: Role; provisionedBy: string; active: boolean }) {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: input.email.toLowerCase() }, create: { email: input.email.toLowerCase(), name: input.name, passwordHash: input.passwordHash, emailVerifiedAt: new Date() }, update: { name: input.name } });
      await tx.$executeRaw`INSERT INTO memberships ("userId","orgId",role,"notifyChanges",active,"provisionedBy") VALUES (${user.id},${input.orgId},CAST(${input.role} AS "Role"),true,${input.active},${input.provisionedBy}) ON CONFLICT ("userId","orgId") DO UPDATE SET active=EXCLUDED.active,"provisionedBy"=EXCLUDED."provisionedBy"`;
      const membership = (await tx.$queryRaw<Array<{ userId: string; orgId: string; role: string; notifyChanges: boolean; active: boolean; provisionedBy: string | null }>>`SELECT * FROM memberships WHERE "userId"=${user.id} AND "orgId"=${input.orgId} LIMIT 1`)[0]!; return { user, membership };
    });
    return { user: this.mapUser(result.user), membership: { userId: result.membership.userId, orgId: result.membership.orgId, role: result.membership.role as Role, notifyChanges: result.membership.notifyChanges, active: result.membership.active, provisionedBy: result.membership.provisionedBy } };
  }

  async setProvisionedMembershipActive(userId: string, orgId: string, provisionedBy: string, active: boolean) { const count = await prisma.$executeRaw`UPDATE memberships SET active=${active} WHERE "userId"=${userId} AND "orgId"=${orgId} AND "provisionedBy"=${provisionedBy}`; if (count && !active) await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }); return count === 1; }

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

  private mapUser = (u: { id: string; email: string; name: string; passwordHash: string; emailVerifiedAt: Date | null; sessionVersion: number; createdAt: Date }): User => ({
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    sessionVersion: u.sessionVersion,
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
