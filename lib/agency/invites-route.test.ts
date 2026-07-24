import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AgencyAccess } from "./access";
import type { AgencyMembership, AgencyWorkspace } from "./types";

const h = vi.hoisted(() => ({
  agencyAccess: vi.fn(),
  getAgencyStore: vi.fn(),
}));

vi.mock("@/lib/agency/access", () => ({
  agencyAccess: h.agencyAccess,
}));
vi.mock("@/lib/agency/store", () => ({
  getAgencyStore: h.getAgencyStore,
}));

import { PATCH } from "@/app/api/agency/invites/route";

const workspace = {
  id: "agency-1",
  ownerOrgId: "org-1",
  name: "Agency",
  slug: "agency",
  consultantMode: true,
  resellerParentId: null,
  branding: {
    whiteLabel: false,
    logoUrl: null,
    primaryColor: "#38e1c3",
    accentColor: "#5b8cff",
    supportEmail: null,
    customDomain: null,
    emailFromName: null,
    emailFooter: null,
  },
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
} satisfies AgencyWorkspace;

function access(role: "owner" | "admin", actorId = "admin-user"): AgencyAccess {
  return {
    workspace,
    role,
    actorId,
    via: "session",
    scopes: ["*"],
    session: {
      user: {
        id: actorId,
        email: "actor@example.test",
        name: "Actor",
        emailVerifiedAt: "2026-07-23T00:00:00.000Z",
        sessionVersion: 0,
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      memberships: [],
    },
  };
}

function membership(userId: string, role: AgencyMembership["role"]): AgencyMembership {
  return {
    agencyId: workspace.id,
    userId,
    role,
    seatLabel: null,
    active: true,
    createdAt: "2026-07-23T00:00:00.000Z",
  };
}

function request(userId: string): NextRequest {
  return new NextRequest("http://localhost/api/agency/invites?agencyId=agency-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, role: "owner" }),
  });
}

beforeEach(() => {
  h.agencyAccess.mockReset();
  h.getAgencyStore.mockReset();
});

describe("agency invites route owner elevation guard", () => {
  it.each(["admin-user", "other-user"])(
    "blocks an admin from promoting %s to owner",
    async (targetUserId) => {
      const updateMembership = vi.fn();
      h.agencyAccess.mockResolvedValue(access("admin"));
      h.getAgencyStore.mockResolvedValue({
        memberships: vi.fn().mockResolvedValue([
          membership("admin-user", "admin"),
          membership("other-user", "manager"),
          membership("agency-owner", "owner"),
        ]),
        updateMembership,
      });

      const response = await PATCH(request(targetUserId));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Only an owner can transfer agency ownership",
      });
      expect(updateMembership).not.toHaveBeenCalled();
    },
  );
});
