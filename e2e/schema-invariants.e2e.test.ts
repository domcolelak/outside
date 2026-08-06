import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";

/**
 * Guarantees that exist only in the database.
 *
 * A partial unique index and an ON DELETE CASCADE cannot be observed from the
 * application code that depends on them — the code simply behaves as though they
 * hold. Drop one in a future migration and nothing in the TypeScript suite would
 * notice: duplicate live remediations would start to accumulate, and deleting an
 * organization would leave its credentials and audit rows behind. These
 * assertions run against real PostgreSQL so the schema has to keep its promises.
 */
const ORG_ID = "e2e_schema_invariants";
const OTHER_ORG_ID = "e2e_schema_invariants_other";

const remediation = (id: string, target = "acme.example") => ({
  id,
  orgId: ORG_ID,
  provider: "cloudflare",
  target,
  action: "add_dmarc_monitoring",
  handle: { zoneId: "z1", recordId: id },
  appliedBy: "e2e-user",
});

async function reset() {
  await prisma.appliedRemediation.deleteMany({ where: { orgId: { in: [ORG_ID, OTHER_ORG_ID] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [ORG_ID, OTHER_ORG_ID] } } });
}

describe.sequential("database-only schema invariants", () => {
  beforeAll(async () => {
    await reset();
    await prisma.organization.createMany({
      data: [
        { id: ORG_ID, name: "Schema invariants E2E", slug: ORG_ID, plan: "professional" },
        { id: OTHER_ORG_ID, name: "Schema invariants E2E other", slug: OTHER_ORG_ID, plan: "professional" },
      ],
    });
  });

  afterAll(async () => {
    await reset();
    await prisma.$disconnect();
  });

  describe("one live remediation per target", () => {
    it("refuses a second active row for the same target and action", async () => {
      await prisma.appliedRemediation.create({ data: remediation("e2e_rem_1") });

      // Without the partial unique index this second insert succeeds, and the
      // customer ends up with two rollback handles for one DNS record — only one
      // of which can be correct.
      await expect(prisma.appliedRemediation.create({ data: remediation("e2e_rem_2") })).rejects.toThrow();
    });

    it("allows re-applying once the previous change is rolled back", async () => {
      await prisma.appliedRemediation.updateMany({
        where: { id: "e2e_rem_1" },
        data: { rolledBackAt: new Date() },
      });

      // The index is partial precisely so this is legal: the constraint is on
      // live changes, not on history.
      await prisma.appliedRemediation.create({ data: remediation("e2e_rem_3") });
      await expect(
        prisma.appliedRemediation.count({ where: { orgId: ORG_ID, rolledBackAt: null } }),
      ).resolves.toBe(1);
    });

    it("does not constrain a different target or a different organization", async () => {
      await prisma.appliedRemediation.create({ data: remediation("e2e_rem_4", "other.example") });
      await prisma.appliedRemediation.create({ data: { ...remediation("e2e_rem_5"), orgId: OTHER_ORG_ID } });
      await expect(
        prisma.appliedRemediation.count({ where: { orgId: { in: [ORG_ID, OTHER_ORG_ID] }, rolledBackAt: null } }),
      ).resolves.toBe(3);
    });
  });

  describe("deleting an organization takes its data with it", () => {
    it("cascades to credentials, telemetry, audit and remediation rows", async () => {
      await prisma.integrationConnection.create({
        data: {
          orgId: OTHER_ORG_ID,
          provider: "hibp",
          encryptedToken: "v1.aaa.bbb.ccc",
          accountHint: "••••4A7F",
          createdBy: "e2e-user",
        },
      });
      await prisma.providerUsageEvent.create({
        data: { orgId: OTHER_ORG_ID, provider: "hibp", operation: "validate", ok: true },
      });
      await prisma.providerAuditEvent.create({
        data: { orgId: OTHER_ORG_ID, provider: "hibp", action: "connected", actorId: "e2e-user" },
      });

      // Deleting the organization must not strand an encrypted credential or an
      // audit row belonging to a tenant that no longer exists.
      await prisma.organization.delete({ where: { id: OTHER_ORG_ID } });

      const where = { orgId: OTHER_ORG_ID };
      await expect(prisma.integrationConnection.count({ where })).resolves.toBe(0);
      await expect(prisma.providerUsageEvent.count({ where })).resolves.toBe(0);
      await expect(prisma.providerAuditEvent.count({ where })).resolves.toBe(0);
      await expect(prisma.appliedRemediation.count({ where })).resolves.toBe(0);
    });

    it("leaves another organization's rows untouched", async () => {
      await expect(
        prisma.appliedRemediation.count({ where: { orgId: ORG_ID } }),
      ).resolves.toBeGreaterThan(0);
    });
  });
});
