import { describe, expect, it } from "vitest";
import { canAssignAgencyRole } from "./role-policy";

describe("agency role assignment policy", () => {
  it("prevents an admin from promoting any seat, including itself, to owner", () => {
    expect(canAssignAgencyRole("admin", "owner")).toBe(false);
  });

  it("keeps ordinary seat administration available to admins", () => {
    expect(canAssignAgencyRole("admin", "admin")).toBe(true);
    expect(canAssignAgencyRole("admin", "manager")).toBe(true);
  });

  it("reserves owner assignment for the existing owner transfer flow", () => {
    expect(canAssignAgencyRole("owner", "owner")).toBe(true);
  });
});
