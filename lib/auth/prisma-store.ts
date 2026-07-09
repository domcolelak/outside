import { PrismaClient } from "@prisma/client";
import type { AuthStore, Membership, Organization, Role, User } from "./model";

const g = globalThis as unknown as { __outsidePrisma?: PrismaClient };
const prisma = g.__outsidePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__outsidePrisma = prisma;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
}

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

  async createUserWithOrg(input: { email: string; name: string; passwordHash: string; orgName: string }) {
    const email = input.email.toLowerCase();
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash: input.passwordHash } });
      const org = await tx.organization.create({ data: { name: input.orgName, slug: slugify(input.orgName), plan: "free" } });
      await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "owner" } });
      return { user, org };
    });
    return { user: this.mapUser(result.user), org: this.mapOrg(result.org) };
  }

  async membershipsForUser(userId: string): Promise<Array<{ org: Organization; role: Role }>> {
    const rows = await prisma.membership.findMany({ where: { userId }, include: { org: true } });
    return rows.map((r) => ({ org: this.mapOrg(r.org), role: r.role as Role }));
  }

  async getMembership(userId: string, orgId: string): Promise<Membership | null> {
    const m = await prisma.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
    return m ? { userId: m.userId, orgId: m.orgId, role: m.role as Role } : null;
  }

  async orgMembers(orgId: string): Promise<Array<{ email: string; name: string; role: Role }>> {
    const rows = await prisma.membership.findMany({ where: { orgId }, include: { user: true } });
    return rows.map((r) => ({ email: r.user.email, name: r.user.name, role: r.role as Role }));
  }

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

  private mapUser = (u: { id: string; email: string; name: string; passwordHash: string; createdAt: Date }): User => ({
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
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
