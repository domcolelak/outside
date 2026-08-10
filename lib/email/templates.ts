import type { ScanResult } from "@/lib/types";
import type { ChangeEvent } from "@/lib/persistence/model";
import type { Monitor } from "@/lib/monitoring";
import type { EmailMessage } from "./provider";
import { APP_URL } from "@/lib/config/runtime";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey, type Translator } from "@/lib/i18n/messages";

/**
 * E-mail is rendered in the recipient's language at the moment it is created.
 *
 * The outbox stores the finished HTML and text, so the language is fixed when
 * the message is enqueued rather than resolved again when a worker happens to
 * deliver it. That is the behaviour we want: a person who changes their language
 * on Tuesday should not retroactively change the wording of Monday's alert, and
 * a delivery worker has no request context to resolve a language from anyway.
 *
 * Every template takes an explicit locale. It defaults to English so that a call
 * site which has no recipient context is a visible, greppable `undefined` rather
 * than silently picking somebody else's language.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(t: Translator, title: string, bodyHtml: string): string {
  // lang on <html> so a mail client reading Hungarian text does not offer to
  // translate it from English, and screen readers pronounce it correctly.
  return `<!doctype html><html lang="${t.locale}"><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:15px;letter-spacing:3px;font-weight:700;color:#e8edf6;">OUTSIDE</div>
    <div style="font-size:11px;letter-spacing:1px;color:#8791a3;margin-top:2px;">${escapeHtml(t.t("email", "brandTagline"))}</div>
    <div style="height:1px;background:rgba(148,173,214,0.14);margin:20px 0;"></div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#e8edf6;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <div style="height:1px;background:rgba(148,173,214,0.14);margin:24px 0;"></div>
    <div style="font-size:11px;color:#6b7793;">${escapeHtml(t.t("email", "footerDisclaimer"))}</div>
  </div></body></html>`;
}

const CHANGE_KEYS = {
  asset_appeared: "changeAssetAppeared",
  asset_returned: "changeAssetReturned",
  asset_disappeared: "changeAssetDisappeared",
  technology_changed: "changeTechnologyChanged",
  priority_changed: "changePriorityChanged",
} as const;

/** The label for a change type, or the raw type when it is one we do not name. */
function changeLabel(t: Translator, type: string): string {
  const key = CHANGE_KEYS[type as keyof typeof CHANGE_KEYS];
  return key ? t.t("email", key) : type;
}

const DETAIL_KEYS = {
  assetAppeared: "detailAssetAppeared",
  assetReturned: "detailAssetReturned",
  assetDisappeared: "detailAssetDisappeared",
  technologyChanged: "detailTechnologyChanged",
  certificateChanged: "detailCertificateChanged",
  priorityChanged: "detailPriorityChanged",
} as const;

/**
 * The explanation for a change, translated.
 *
 * Change events persist, and rows written before localization carry only the
 * English sentence. Falling back to it keeps historical alerts and reports
 * readable instead of showing a bare key.
 */
function changeDetail(t: Translator, event: ChangeEvent): string {
  const key = event.detailKey ? DETAIL_KEYS[event.detailKey] : undefined;
  return key ? t.t("email", key) : event.detail;
}

/**
 * Interpolate a catalog sentence into HTML.
 *
 * The template comes from a reviewed message file and is trusted; the values do
 * not, so they are escaped before substitution. Escaping the finished sentence
 * instead would either double-escape the markup we deliberately add (a bolded
 * domain) or, worse, invite a search-and-replace over escaped text that breaks
 * the moment a translation mentions the value twice.
 */
function htmlMessage(t: Translator, key: MessageKey<"email">, values: Record<string, string | number>): string {
  const escaped = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, escapeHtml(value)]));
  return t.t("email", key, escaped);
}

const button = (href: string, label: string, color = "#38e1c3") =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:12px;background:${color};color:#05070a;font-weight:600;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">${escapeHtml(label)}</a>`;

export function changeAlertEmail(to: string, monitor: Monitor, result: ScanResult, events: ChangeEvent[], locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const domain = escapeHtml(monitor.domain);
  const rows = events.map((event) =>
    `<div style="padding:10px 12px;border:1px solid rgba(148,173,214,0.14);border-radius:8px;margin-bottom:8px;">
      <div style="font-family:monospace;font-size:13px;color:#e8edf6;">${escapeHtml(event.label)}</div>
      <div style="font-size:12px;color:#aab6cc;margin-top:2px;">${escapeHtml(changeLabel(t, event.type))} — ${escapeHtml(changeDetail(t, event))}</div>
    </div>`).join("");
  // The count phrase is a plural entry so Slovak, Czech and Polish pick the
  // right form; the surrounding sentence is translated whole, not assembled.
  const changes = t.t("email", "alertChangeCount", { count: events.length });
  const surfaceUrl = `${APP_URL}/scan?target=${encodeURIComponent(monitor.domain)}`;
  const html = shell(
    t,
    t.t("email", "alertTitle", { domain: monitor.domain }),
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;margin:0 0 16px;">${t.t("email", "alertBody", { domain: `<strong style="color:#e8edf6;">${domain}</strong>`, changes: escapeHtml(changes), score: result.score.value })}</p>
     ${rows}
     ${button(surfaceUrl, t.t("email", "alertAction"))}`,
  );
  const text = `${t.t("email", "alertTitle", { domain: monitor.domain })}\n\n${events.map((event) => `- ${changeLabel(t, event.type)}: ${event.label} — ${changeDetail(t, event)}`).join("\n")}\n\n${t.t("email", "alertPosture", { score: result.score.value })}\n${surfaceUrl}`;
  return { to, subject: t.t("email", "alertSubject", { count: events.length, domain: monitor.domain }), html, text };
}

export function inviteEmail(to: string, orgName: string, role: string, acceptUrl: string, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const title = t.t("email", "inviteTitle", { orgName });
  const html = shell(
    t,
    title,
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${htmlMessage(t, "inviteBody", { orgName, role })}</p>
     ${button(acceptUrl, t.t("email", "inviteAction"))}`,
  );
  return { to, subject: title, html, text: `${t.t("email", "inviteText", { orgName, role })}\n${acceptUrl}` };
}

export function agencyInviteEmail(to: string, agencyName: string, role: string, acceptUrl: string, branding?: { whiteLabel?: boolean; primaryColor?: string; emailFromName?: string | null; emailFooter?: string | null }, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const sender = branding?.whiteLabel ? branding.emailFromName || agencyName : `${agencyName} on OUTSIDE`;
  const color = /^#[0-9a-f]{6}$/i.test(branding?.primaryColor ?? "") ? branding!.primaryColor! : "#38e1c3";
  const footer = branding?.emailFooter ? `<div style="font-size:11px;color:#6b7793;">${escapeHtml(branding.emailFooter)}</div>` : "";
  const title = t.t("email", "agencyInviteTitle", { agencyName });
  const body = `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${htmlMessage(t, "agencyInviteBody", { agencyName, role })}</p>${button(acceptUrl, t.t("email", "agencyInviteAction"), color)}${footer}`;
  const html = branding?.whiteLabel
    ? `<!doctype html><html lang="${t.locale}"><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;"><div style="max-width:560px;margin:0 auto;padding:32px 24px;"><div style="font-size:15px;letter-spacing:2px;font-weight:700;color:#e8edf6;">${escapeHtml(sender)}</div><div style="height:1px;background:rgba(148,173,214,0.14);margin:20px 0;"></div><h1 style="font-size:20px;margin:0 0 12px;color:#e8edf6;">${escapeHtml(title)}</h1>${body}</div></body></html>`
    : shell(t, title, body);
  return { to, subject: t.t("email", "agencyInviteSubject", { sender }), html, text: `${t.t("email", "agencyInviteText", { agencyName, role })} ${acceptUrl}${branding?.emailFooter ? `\n\n${branding.emailFooter}` : ""}` };
}

export function agencyReportReadyEmail(to: string, reportTitle: string, reportUrl: string, agencyName: string, branding: { whiteLabel?: boolean; primaryColor?: string; emailFromName?: string | null; emailFooter?: string | null }, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const sender = branding.whiteLabel ? branding.emailFromName || agencyName : `${agencyName} on OUTSIDE`;
  const color = /^#[0-9a-f]{6}$/i.test(branding.primaryColor ?? "") ? branding.primaryColor! : "#38e1c3";
  const heading = t.t("email", "reportReadyTitle");
  const body = `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${htmlMessage(t, "reportReadyBody", { reportTitle })}</p>${button(reportUrl, t.t("email", "reportReadyAction"), color)}${branding.emailFooter ? `<div style="font-size:11px;color:#6b7793;">${escapeHtml(branding.emailFooter)}</div>` : ""}`;
  const html = branding.whiteLabel
    ? `<!doctype html><html lang="${t.locale}"><body style="margin:0;background:#05070a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8edf6;"><div style="max-width:560px;margin:0 auto;padding:32px 24px;"><div style="font-weight:700;letter-spacing:2px;">${escapeHtml(sender)}</div><h1 style="font-size:20px;">${escapeHtml(heading)}</h1>${body}</div></body></html>`
    : shell(t, heading, body);
  return { to, subject: `${sender}: ${reportTitle}`, html, text: `${t.t("email", "reportReadyText", { reportTitle })} ${reportUrl}${branding.emailFooter ? `\n\n${branding.emailFooter}` : ""}` };
}

export function welcomeEmail(to: string, name: string, verificationUrl?: string, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const actionUrl = verificationUrl ?? APP_URL;
  const actionLabel = verificationUrl ? t.t("email", "welcomeActionVerify") : t.t("email", "welcomeActionOpen");
  const firstName = name.split(" ")[0] ?? name;
  const html = shell(
    t,
    t.t("email", "welcomeTitle", { firstName }),
    // shell() escapes the title, so the name is escaped exactly once.
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${escapeHtml(t.t("email", "welcomeBody"))}</p>
     ${button(actionUrl, actionLabel)}`,
  );
  const text = verificationUrl
    ? `${t.t("email", "welcomeTextVerify", { name })} ${verificationUrl}`
    : `${t.t("email", "welcomeTextOpen", { name })} ${APP_URL}`;
  return { to, subject: t.t("email", "welcomeSubject"), html, text };
}

export function verifyEmail(to: string, verificationUrl: string, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const html = shell(
    t,
    t.t("email", "verifyTitle"),
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${escapeHtml(t.t("email", "verifyBody"))}</p>
     ${button(verificationUrl, t.t("email", "verifyAction"))}`,
  );
  return { to, subject: t.t("email", "verifySubject"), html, text: `${t.t("email", "verifyText")} ${verificationUrl}` };
}

export function passwordResetEmail(to: string, resetUrl: string, locale: Locale = DEFAULT_LOCALE): EmailMessage {
  const t = getTranslator(locale);
  const html = shell(
    t,
    t.t("email", "resetTitle"),
    `<p style="font-size:14px;line-height:1.5;color:#aab6cc;">${escapeHtml(t.t("email", "resetBody"))}</p>
     ${button(resetUrl, t.t("email", "resetAction"))}`,
  );
  return { to, subject: t.t("email", "resetSubject"), html, text: `${t.t("email", "resetText")} ${resetUrl}\n\n${t.t("email", "resetTextNoAction")}` };
}
