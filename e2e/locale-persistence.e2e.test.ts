import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAuthStore } from "@/lib/auth/prisma-store";
import { prisma } from "@/lib/db/prisma";
import { resolveLocale } from "@/lib/i18n/resolve";

/**
 * Locale preferences have to survive the trip through the database.
 *
 * The resolution order is unit-tested against plain values, which cannot catch a
 * store mapper that silently drops the column: every read would return null, the
 * organization step would never fire, and the only symptom would be pages
 * rendering in English for people who had chosen otherwise. These assertions run
 * against real PostgreSQL and read back through the same store the app uses.
 */
const ORG_ID = "e2e_locale_persistence";
const EMAIL = "locale-persistence@e2e.example";

const store = new PrismaAuthStore();

const OWNER_ORG_NAME = "Locale E2E owner";

async function reset() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  // createUserWithOrg makes its own organization with a unique slug; leaving it
  // behind would collide on the next run.
  await prisma.organization.deleteMany({ where: { OR: [{ id: ORG_ID }, { name: OWNER_ORG_NAME }] } });
}

describe.sequential("locale preferences persist", () => {
  beforeAll(reset);
  afterAll(reset);

  it("defaults an organization to English without a migration touching existing rows", async () => {
    await prisma.organization.create({ data: { id: ORG_ID, name: "Locale E2E", slug: ORG_ID, plan: "professional" } });
    const org = await store.getOrganization(ORG_ID);
    expect(org?.defaultLocale).toBe("en");
  });

  it("reads an organization default back through the membership join", async () => {
    const { user } = await store.createUserWithOrg({ email: EMAIL, name: "Locale E2E", passwordHash: "x", orgName: OWNER_ORG_NAME });
    await store.setOrganizationLocale(ORG_ID, "pl");
    await prisma.membership.create({ data: { userId: user.id, orgId: ORG_ID, role: "analyst" } });

    // membershipsForUser is the path the renderer actually uses.
    const memberships = await store.membershipsForUser(user.id);
    const joined = memberships.find((entry) => entry.org.id === ORG_ID);
    expect(joined?.org.defaultLocale).toBe("pl");
  });

  it("keeps a person's own choice above the organization default", async () => {
    const before = await store.findUserByEmail(EMAIL);
    // Nobody has chosen yet, so the organization default is what should apply.
    expect(before?.preferredLocale ?? null).toBeNull();

    await store.setPreferredLocale(before!.id, "sk");
    const after = await store.getUser(before!.id);
    expect(after?.preferredLocale).toBe("sk");

    expect(resolveLocale({ userPreference: after?.preferredLocale ?? null, organizationDefault: "pl" }))
      .toEqual({ locale: "sk", source: "user" });
  });
});
