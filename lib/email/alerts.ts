/**
 * Change-alert dispatch. Intelligently avoids alert fatigue: it only notifies on
 * meaningful changes (new/returned public assets, or any high-priority change),
 * groups them into a single email per monitor, and no-ops when there is nothing
 * worth reporting.
 */

import type { ScanResult } from "@/lib/types";
import type { ChangeEvent } from "@/lib/persistence/model";
import type { Monitor } from "@/lib/monitoring";
import { getAuthStore } from "@/lib/auth";
import { getEmailProvider } from "./provider";
import { changeAlertEmail } from "./templates";

const HIGH = new Set(["high", "critical"]);

/** Which change events are worth an email. */
export function alertableEvents(events: ChangeEvent[]): ChangeEvent[] {
  return events.filter((e) => e.type === "asset_appeared" || e.type === "asset_returned" || HIGH.has(e.priority));
}

/** Returns true if an alert was sent. Failures are swallowed (never break a scan). */
export async function dispatchChangeAlert(monitor: Monitor, result: ScanResult): Promise<boolean> {
  const events = alertableEvents(result.changeSummary?.events ?? []);
  if (events.length === 0) return false;

  try {
    const auth = await getAuthStore();
    const members = await auth.orgMembers(monitor.orgId);
    // Notify owners/admins/analysts (not view-only members).
    const recipients = members.filter((m) => m.role !== "viewer").map((m) => m.email);
    if (recipients.length === 0) return false;

    const email = getEmailProvider();
    await Promise.all(recipients.map((to) => email.send(changeAlertEmail(to, monitor, result, events))));
    return true;
  } catch (err) {
    console.error(`[alerts] dispatch failed for ${monitor.domain}:`, (err as Error).message);
    return false;
  }
}
