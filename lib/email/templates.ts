import type { ScanResult } from "@/lib/types";
import type { ChangeEvent } from "@/lib/persistence/model";
import type { Monitor } from "@/lib/monitoring";
import type { EmailMessage } from "./provider";
import { APP_URL } from "@/lib/config/runtime";

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:15px;letter-spacing:3px;font-weight:700;color:#e8edf6;">OUTSIDE</div>
    <div style="font-size:11px;letter-spacing:1px;color:#8791a3;margin-top:2px;">EXTERNAL EXPOSURE INTELLIGENCE</div>
    <div style="height:1px;background:rgba(148,173,214,0.14);margin:20px 0;"></div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#e8edf6;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <div style="height:1px;background:rgba(148,173,214,0.14);margin:24px 0;"></div>
    <div style="font-size:11px;color:#6b7793;">You are receiving this because your organization uses OUTSIDE. This message describes external discovery only — not compromise or unauthorized access.</div>
  </div></body></html>`;
}

const CHANGE_LABEL: Record<string, string> = {
  asset_appeared: "New asset",
  asset_returned: "Returned",
  asset_disappeared: "No longer observed",
  technology_changed: "Technology changed",
  priority_changed: "Priority increased",
};

export function changeAlertEmail(to: string, monitor: Monitor, result: ScanResult, events: ChangeEvent[]): EmailMessage {
  const domain = escapeHtml(monitor.domain);
  const rows = events.map((event) =>
    `<div style="padding:10px 12px;border:1px solid rgba(148,173,214,0.14);border-radius:8px;margin-bottom:8px;">
      <div style="font-family:monospace;font-size:13px;color:#e8edf6;">${escapeHtml(event.label)}</div>
      <div style="font-size:12px;color:#aab6cc;margin-top:2px;">${escapeHtml(CHANGE_LABEL[event.type] ?? event.type)} — ${escapeHtml(event.detail)}</div>
    </div>`).join("");
  const html = shell(
    `Changes detected on ${monitor.domain}`,
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;margin:0 0 16px;">The latest external-surface scan of <strong style="color:#e8edf6;">${domain}</strong> found ${events.length} notable change${events.length === 1 ? "" : "s"}. Current exposure score: <strong style="color:#38e1c3;">${result.score.value}/100</strong>.</p>
     ${rows}
     <a href="${escapeHtml(`${APP_URL}/scan?target=${encodeURIComponent(monitor.domain)}`)}" style="display:inline-block;margin-top:12px;background:#38e1c3;color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">View external surface</a>`,
  );
  const text = `Changes detected on ${monitor.domain}\n\n${events.map((event) => `- ${CHANGE_LABEL[event.type] ?? event.type}: ${event.label} — ${event.detail}`).join("\n")}\n\nExposure score: ${result.score.value}/100\n${APP_URL}/scan?target=${monitor.domain}`;
  return { to, subject: `OUTSIDE: ${events.length} change${events.length === 1 ? "" : "s"} on ${monitor.domain}`, html, text };
}

export function inviteEmail(to: string, orgName: string, role: string, acceptUrl: string): EmailMessage {
  const html = shell(
    `You're invited to ${orgName} on OUTSIDE`,
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">You've been invited to join <strong style="color:#e8edf6;">${escapeHtml(orgName)}</strong> as <strong style="color:#e8edf6;">${escapeHtml(role)}</strong> on OUTSIDE — external exposure intelligence.</p>
     <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;margin-top:12px;background:#38e1c3;color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">Accept invitation</a>`,
  );
  return { to, subject: `You're invited to ${orgName} on OUTSIDE`, html, text: `You've been invited to join ${orgName} as ${role} on OUTSIDE.\nAccept: ${acceptUrl}` };
}

export function agencyInviteEmail(to: string, agencyName: string, role: string, acceptUrl: string, branding?: { whiteLabel?: boolean; primaryColor?: string; emailFromName?: string | null; emailFooter?: string | null }): EmailMessage {
  const sender = branding?.whiteLabel ? branding.emailFromName || agencyName : `${agencyName} on OUTSIDE`;
  const color = /^#[0-9a-f]{6}$/i.test(branding?.primaryColor ?? "") ? branding!.primaryColor! : "#38e1c3";
  const footer = branding?.emailFooter ? `<div style="font-size:11px;color:#6b7793;">${escapeHtml(branding.emailFooter)}</div>` : "";
  const body = `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">You've been invited to the <strong style="color:#e8edf6;">${escapeHtml(agencyName)}</strong> security workspace as <strong style="color:#e8edf6;">${escapeHtml(role)}</strong>.</p><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;margin:12px 0;background:${color};color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">Open secure invitation</a>${footer}`;
  const html = branding?.whiteLabel
    ? `<!doctype html><html><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;"><div style="max-width:560px;margin:0 auto;padding:32px 24px;"><div style="font-size:15px;letter-spacing:2px;font-weight:700;color:#e8edf6;">${escapeHtml(sender)}</div><div style="height:1px;background:rgba(148,173,214,0.14);margin:20px 0;"></div><h1 style="font-size:20px;margin:0 0 12px;color:#e8edf6;">You're invited by ${escapeHtml(agencyName)}</h1>${body}</div></body></html>`
    : shell(`You're invited by ${agencyName}`, body);
  return { to, subject: `${sender}: secure workspace invitation`, html, text: `${agencyName} invited you as ${role}. Accept: ${acceptUrl}${branding?.emailFooter ? `\n\n${branding.emailFooter}` : ""}` };
}

export function agencyReportReadyEmail(to: string, reportTitle: string, reportUrl: string, agencyName: string, branding: { whiteLabel?: boolean; primaryColor?: string; emailFromName?: string | null; emailFooter?: string | null }): EmailMessage {
  const sender = branding.whiteLabel ? branding.emailFromName || agencyName : `${agencyName} on OUTSIDE`; const color = /^#[0-9a-f]{6}$/i.test(branding.primaryColor ?? "") ? branding.primaryColor! : "#38e1c3";
  const body = `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">Your security report <strong style="color:#e8edf6;">${escapeHtml(reportTitle)}</strong> is ready for secure review.</p><a href="${escapeHtml(reportUrl)}" style="display:inline-block;margin:12px 0;background:${color};color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">Open report</a>${branding.emailFooter ? `<div style="font-size:11px;color:#6b7793;">${escapeHtml(branding.emailFooter)}</div>` : ""}`;
  const html = branding.whiteLabel ? `<!doctype html><html><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;"><div style="max-width:560px;margin:0 auto;padding:32px 24px;"><div style="font-weight:700;letter-spacing:2px;">${escapeHtml(sender)}</div><h1 style="font-size:20px;">Security report ready</h1>${body}</div></body></html>` : shell("Security report ready", body);
  return { to, subject: `${sender}: ${reportTitle}`, html, text: `${reportTitle} is ready: ${reportUrl}${branding.emailFooter ? `\n\n${branding.emailFooter}` : ""}` };
}

export function welcomeEmail(to: string, name: string, verificationUrl?: string): EmailMessage {
  const actionUrl = verificationUrl ?? APP_URL;
  const actionLabel = verificationUrl ? "Verify email" : "Open OUTSIDE";
  const html = shell(
    `Welcome to OUTSIDE, ${name.split(" ")[0]}`,
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">Enter a domain and watch its public digital footprint reveal itself. Verify ownership to unlock monitoring and change alerts.</p>
     <a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:12px;background:#38e1c3;color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">${actionLabel}</a>`,
  );
  return { to, subject: "Welcome to OUTSIDE", html, text: `Welcome to OUTSIDE, ${name}. ${verificationUrl ? `Verify your email: ${verificationUrl}` : `Open ${APP_URL} to map your external surface.`}` };
}

export function verifyEmail(to: string, verificationUrl: string): EmailMessage {
  const html = shell(
    "Verify your email address",
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">Confirm this email address before sending team invitations or accepting organization access.</p>
     <a href="${escapeHtml(verificationUrl)}" style="display:inline-block;margin-top:12px;background:#38e1c3;color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">Verify email</a>`,
  );
  return { to, subject: "Verify your OUTSIDE email", html, text: `Verify your email address: ${verificationUrl}` };
}
