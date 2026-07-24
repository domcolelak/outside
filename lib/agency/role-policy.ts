import type { AgencyRole } from "./types";

/**
 * Owner elevation is an ownership transfer operation, not ordinary seat
 * administration. Agency admins intentionally have seats:manage, but that
 * permission must never allow them to mint a new owner (including themselves).
 */
export function canAssignAgencyRole(actorRole: AgencyRole, nextRole: AgencyRole): boolean {
  return nextRole !== "owner" || actorRole === "owner";
}
