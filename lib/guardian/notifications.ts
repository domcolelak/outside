import { createHmac } from "node:crypto";
import { getAuthStore } from "@/lib/auth";
import { getEmailProvider } from "@/lib/email/provider";
import { decryptGuardianConfig, channelAssociatedData } from "./crypto";
import { safeGuardianPost, type GuardianHttpRequest } from "./transport";
import type { GuardianStore } from "./store-model";
import type { GuardianAnalysis, GuardianChannelType, GuardianDigest, GuardianEvent, GuardianRecommendation } from "./types";
import { groupCardsByArea, type DigestArea, type DigestRecommendationCard } from "./digest-content";
import { recordGuardianDelivery, recordGuardianQueueMetrics } from "@/lib/observability/metrics";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { organizationLocale, recipientLocale } from "@/lib/i18n/recipient";
import { getTranslator, type MessageKey, type Translator } from "@/lib/i18n/messages";
import { localizeGuardianDrift, localizeGuardianEvent, localizeGuardianRecommendation } from "./localize";

type Config = Record<string, string>;
interface EventPayload { kind: "event_group"; target: string; scanId: string; observedAt: string; events: GuardianEvent[]; locale: Locale }
interface DigestPayload { kind: "weekly_digest"; digest: GuardianDigest; locale: Locale }
interface EmailPayload { to: string; subject: string; text: string; html: string }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function alertableGuardianEvents(events: GuardianEvent[]): GuardianEvent[] {
  const important = events.filter((event) => event.severity === "critical" || event.severity === "high");
  const mediumByCategory = new Map<string, GuardianEvent[]>();
  for (const event of events.filter((row) => row.severity === "medium")) mediumByCategory.set(event.category, [...(mediumByCategory.get(event.category) ?? []), event]);
  const grouped = [...mediumByCategory.values()].filter((group) => group.length >= 3).flat();
  return [...new Map([...important, ...grouped].map((event) => [event.id, event])).values()];
}

export async function queueGuardianEventNotifications(store: GuardianStore, analysis: GuardianAnalysis): Promise<number> {
  const events = alertableGuardianEvents(analysis.events);
  if (!events.length) return 0;
  const channels = (await store.channels(analysis.snapshot.orgId)).filter((channel) => channel.enabled);
  const auth = await getAuthStore();
  const organization = await auth.getOrganization(analysis.snapshot.orgId).catch(() => null);
  const channelLocale = organizationLocale(organization?.defaultLocale);
  const payload: EventPayload = { kind: "event_group", target: analysis.snapshot.target, scanId: analysis.snapshot.scanId, observedAt: analysis.snapshot.observedAt, events, locale: channelLocale };
  const members = await auth.orgMembers(analysis.snapshot.orgId);
  const recipients = members.filter((member) => member.role !== "viewer" && member.notifyChanges);
  const jobs = [
    ...channels.map((channel) => store.queueDelivery({ idempotencyKey: `guardian:event:${analysis.snapshot.orgId}:${analysis.snapshot.scanId}:${channel.id}`, orgId: analysis.snapshot.orgId, channelId: channel.id, channelType: channel.type, target: analysis.snapshot.target, kind: "event_group", itemCount: events.length, payload })),
    ...recipients.map((member) => { const locale = recipientLocale({ userPreference: member.preferredLocale, organizationDefault: organization?.defaultLocale }); return store.queueDelivery({ idempotencyKey: `guardian:event:${analysis.snapshot.orgId}:${analysis.snapshot.scanId}:email:${member.email.toLowerCase()}`, orgId: analysis.snapshot.orgId, channelId: null, channelType: "email", target: analysis.snapshot.target, kind: "event_group", itemCount: events.length, payload: eventEmail(member.email, { ...payload, locale }) }); }),
  ];
  await Promise.all(jobs);
  return jobs.length;
}

export async function queueGuardianDigestNotifications(store: GuardianStore, digest: GuardianDigest): Promise<number> {
  const channels = (await store.channels(digest.orgId)).filter((channel) => channel.enabled);
  const auth = await getAuthStore();
  const [members, organization] = await Promise.all([auth.orgMembers(digest.orgId), auth.getOrganization(digest.orgId).catch(() => null)]);
  const recipients = members.filter((member) => member.role !== "viewer" && member.notifyChanges);
  const payload: DigestPayload = { kind: "weekly_digest", digest, locale: organizationLocale(organization?.defaultLocale) };
  const jobs = [
    ...channels.map((channel) => store.queueDelivery({ idempotencyKey: `guardian:digest:${digest.orgId}:${digest.target}:${digest.weekOf}:${channel.id}`, orgId: digest.orgId, channelId: channel.id, channelType: channel.type, target: digest.target, kind: "weekly_digest", itemCount: digest.recommendations.cards.length, payload })),
    ...recipients.map((member) => { const locale = recipientLocale({ userPreference: member.preferredLocale, organizationDefault: organization?.defaultLocale }); return store.queueDelivery({ idempotencyKey: `guardian:digest:${digest.orgId}:${digest.target}:${digest.weekOf}:email:${member.email.toLowerCase()}`, orgId: digest.orgId, channelId: null, channelType: "email", target: digest.target, kind: "weekly_digest", itemCount: digest.recommendations.cards.length, payload: digestEmail(member.email, digest, locale) }); }),
  ];
  await Promise.all(jobs);
  return jobs.length;
}

type GuardianKey = MessageKey<"guardian">;

const DIGEST_AREA_KEY: Record<DigestArea, GuardianKey> = {
  "Email security": "digestAreaEmail",
  "Web security": "digestAreaWeb",
  Certificates: "digestAreaCertificates",
  Identity: "digestAreaIdentity",
  Infrastructure: "digestAreaInfrastructure",
  Privacy: "digestAreaPrivacy",
};

function priorityLabel(priority: GuardianEvent["severity"], tr: Translator): string {
  const suffix = priority === "info" ? "Info" : `${priority[0]!.toUpperCase()}${priority.slice(1)}`;
  return tr.t("ui", `priority${suffix}` as Parameters<typeof tr.t<"ui">>[1]);
}

function stateLabel(state: DigestRecommendationCard["state"], tr: Translator): string {
  return tr.t("guardian", `digestState${state[0]!.toUpperCase()}${state.slice(1)}` as GuardianKey);
}

function cardCopy(item: DigestRecommendationCard, tr: Translator) {
  if (tr.locale === "en") return { title: item.title, action: item.action };
  const recommendation = {
    code: item.code,
    affectedAssets: Array.from({ length: Math.max(1, item.assetCount) }, () => item.affectedAsset),
    guides: [],
  } as unknown as GuardianRecommendation;
  const copy = localizeGuardianRecommendation(recommendation, tr);
  return { title: copy.title, action: copy.suggestedReview };
}

function eventEmail(to: string, payload: EventPayload): EmailPayload {
  const tr = getTranslator(payload.locale);
  const events = payload.events.map((event) => ({ event, copy: localizeGuardianEvent(event, tr) }));
  const lines = events.map(({ event, copy }) => `${priorityLabel(event.severity, tr).toLocaleUpperCase(payload.locale)}: ${copy.title}\n${copy.summary}\n${tr.t("guardian", "digestWhy")}: ${copy.why}`);
  const heading = tr.t("guardian", "eventEmailHeading", { count: events.length });
  const text = `${tr.t("guardian", "eventEmailIntro", { count: events.length, target: payload.target })}\n\n${lines.join("\n\n")}`;
  const html = `<html lang="${payload.locale}"><body style="margin:0"><div style="font-family:Inter,Arial,sans-serif;background:#07100d;color:#eaf7f0;padding:32px"><p style="color:#76e6a8;letter-spacing:.12em">OUTSIDE GUARDIAN</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(payload.target)}</p>${events.map(({ event, copy }) => `<div style="margin:18px 0;padding:16px;border:1px solid #244339;border-radius:12px"><small>${escapeHtml(priorityLabel(event.severity, tr))}</small><strong style="display:block;margin-top:6px">${escapeHtml(copy.title)}</strong><p>${escapeHtml(copy.summary)}</p><small>${escapeHtml(copy.why)}</small></div>`).join("")}</div></body></html>`;
  return { to, subject: tr.t("guardian", "eventEmailSubject", { count: events.length, target: payload.target }), text, html };
}

/**
 * Render the weekly digest. The three subjects stay visually separate — what
 * changed, how protected the surface is, and what is open to act on — and every
 * recommendation card carries the facts needed to act on it without opening the
 * app first: severity, affected asset, whether it is new, the action, and a
 * tenant-scoped link.
 */
export function digestEmail(to: string, digest: GuardianDigest, locale: Locale = DEFAULT_LOCALE): EmailPayload {
  const tr = getTranslator(locale);
  const { changeStatus: change, posture, recommendations } = digest;
  const groups = groupCardsByArea(recommendations.cards);
  const more = recommendations.additional > 0 ? tr.t("guardian", "digestMoreRecommendations", { count: recommendations.additional }) : "";
  const headline = locale === "en"
    ? digest.headline
    : change.highPriorityAlerts > 0
      ? tr.t("guardian", "digestHeadlineHigh", { count: change.highPriorityAlerts })
      : change.materialChanges > 0 && posture.drift.direction !== "worsening"
        ? tr.t("guardian", "digestHeadlineChanged")
        : localizeGuardianDrift(posture.drift, tr).headline;
  const executiveSummary = locale === "en" ? digest.executiveSummary : tr.t("guardian", "digestExecutiveSummary", {
    new: change.newAssets,
    returning: change.returnedAssets,
    removed: change.removedAssets,
    signals: change.newSurfaceSignals,
    recommendations: recommendations.total,
  });
  const changeLine = tr.t("guardian", "digestChangeLine", {
    new: change.newAssets,
    returning: change.returnedAssets,
    removed: change.removedAssets,
    signals: change.newSurfaceSignals,
    alerts: change.highPriorityAlerts,
  });
  const postureLine = tr.t("guardian", "digestPostureLine", {
    posture: localizeGuardianDrift(posture.drift, tr).headline,
    shadow: posture.shadowAssets,
  });

  const textCards = groups
    .map((group) => `${tr.t("guardian", DIGEST_AREA_KEY[group.area])}\n${group.cards.map((item) => {
      const copy = cardCopy(item, tr);
      return `- [${priorityLabel(item.priority, tr).toLocaleUpperCase(locale)} · ${stateLabel(item.state, tr)}] ${copy.title}\n  ${tr.t("guardian", "digestAsset")}: ${item.affectedAsset}${item.assetCount > 1 ? ` (${tr.t("guardian", "digestMoreAssets", { count: item.assetCount - 1 })})` : ""}\n  ${tr.t("guardian", "digestAction")}: ${copy.action}\n  ${item.link}`;
    }).join("\n")}`)
    .join("\n\n");
  const text = [headline, executiveSummary, changeLine, postureLine, tr.t("guardian", "digestOpenRecommendations", { count: recommendations.total }), textCards, more].filter(Boolean).join("\n\n");

  const card = (item: DigestRecommendationCard) => {
    const copy = cardCopy(item, tr);
    return `<div style="margin-top:10px;padding:14px;border:1px solid #244339;border-radius:12px">
<div style="font-size:11px;letter-spacing:.08em;color:#9fd9bd">${escapeHtml(priorityLabel(item.priority, tr).toLocaleUpperCase(locale))} · ${escapeHtml(stateLabel(item.state, tr))}</div>
<strong style="display:block;margin-top:6px">${escapeHtml(copy.title)}</strong>
<div style="margin-top:6px;font-size:13px;color:#9fd9bd">${escapeHtml(item.affectedAsset)}${item.assetCount > 1 ? ` <span style="color:#6f9d87">${escapeHtml(tr.t("guardian", "digestMoreAssets", { count: item.assetCount - 1 }))}</span>` : ""}</div>
<p style="margin:8px 0 0;font-size:13px">${escapeHtml(copy.action)}</p>
<a href="${escapeHtml(item.link)}" style="display:inline-block;margin-top:10px;font-size:12px;color:#76e6a8">${escapeHtml(tr.t("guardian", "digestOpenOutside"))}</a>
</div>`;
  };

  const html = `<html lang="${locale}"><body style="margin:0"><div style="font-family:Inter,Arial,sans-serif;background:#07100d;color:#eaf7f0;padding:32px">
<p style="color:#76e6a8;letter-spacing:.12em">OUTSIDE GUARDIAN · ${escapeHtml(tr.t("guardian", "digestWeekly"))}</p>
<h1 style="margin:0 0 8px">${escapeHtml(headline)}</h1>
<p style="color:#9fd9bd">${escapeHtml(digest.target)}</p>
<p>${escapeHtml(executiveSummary)}</p>
<h2 style="margin:28px 0 6px;font-size:15px">${escapeHtml(tr.t("guardian", "digestWhatChanged"))}</h2>
<p style="margin:0;font-size:13px;color:#9fd9bd">${escapeHtml(changeLine)}</p>
<h2 style="margin:24px 0 6px;font-size:15px">${escapeHtml(tr.t("guardian", "digestProtectionPosture"))}</h2>
<p style="margin:0;font-size:13px;color:#9fd9bd">${escapeHtml(postureLine)}</p>
<h2 style="margin:24px 0 6px;font-size:15px">${escapeHtml(tr.t("guardian", "digestOpenRecommendations", { count: recommendations.total }))}</h2>
${groups.map((group) => `<div style="margin-top:16px"><div style="font-size:11px;letter-spacing:.08em;color:#76e6a8">${escapeHtml(tr.t("guardian", DIGEST_AREA_KEY[group.area]).toLocaleUpperCase(locale))}</div>${group.cards.map(card).join("")}</div>`).join("")}
${more ? `<p style="margin-top:18px;font-size:13px;color:#9fd9bd">${escapeHtml(more)}</p>` : ""}
</div></body></html>`;

  return { to, subject: tr.t("guardian", "digestSubject", { headline }), text, html };
}

function concisePayload(payload: EventPayload | DigestPayload) {
  const tr = getTranslator(payload.locale);
  if (payload.kind === "weekly_digest") {
    const { digest } = payload;
    const headline = payload.locale === "en" ? digest.headline : digest.changeStatus.highPriorityAlerts > 0
      ? tr.t("guardian", "digestHeadlineHigh", { count: digest.changeStatus.highPriorityAlerts })
      : digest.changeStatus.materialChanges > 0 && digest.posture.drift.direction !== "worsening"
        ? tr.t("guardian", "digestHeadlineChanged")
        : localizeGuardianDrift(digest.posture.drift, tr).headline;
    const text = payload.locale === "en" ? digest.executiveSummary : tr.t("guardian", "digestExecutiveSummary", {
      new: digest.changeStatus.newAssets,
      returning: digest.changeStatus.returnedAssets,
      removed: digest.changeStatus.removedAssets,
      signals: digest.changeStatus.newSurfaceSignals,
      recommendations: digest.recommendations.total,
    });
    return { title: headline, text, target: digest.target, items: digest.recommendations.cards.map((item) => ({ ...cardCopy(item, tr), severity: priorityLabel(item.priority, tr) })).map((item) => ({ title: item.title, detail: item.action, severity: item.severity })) };
  }
  return {
    title: tr.t("guardian", "eventEmailHeading", { count: payload.events.length }),
    text: tr.t("guardian", "workflowExternalChanges", { target: payload.target }),
    target: payload.target,
    items: payload.events.map((event) => { const copy = localizeGuardianEvent(event, tr); return { title: copy.title, detail: copy.summary, severity: priorityLabel(event.severity, tr) }; }),
  };
}

function safeWorkflowText(value: string): string {
  // Public observations are untrusted text. Neutralize provider markup and
  // mention syntax so a hostname or redirect cannot ping people or channels.
  return value.replace(/&/g, "and").replace(/[<>]/g, "").replace(/@/g, "@\u200b");
}

function required(config: Config, key: string): string {
  const value = config[key]?.trim();
  if (!value) throw new Error(`Integration configuration is missing ${key}.`);
  return value;
}

function requestFor(type: GuardianChannelType, config: Config, payload: EventPayload | DigestPayload): GuardianHttpRequest {
  const summary = concisePayload(payload);
  const markdown = `**${safeWorkflowText(summary.title)}**\n${safeWorkflowText(summary.text)}\n\n${summary.items.slice(0, 10).map((item) => `• [${item.severity.toUpperCase()}] ${safeWorkflowText(item.title)} — ${safeWorkflowText(item.detail)}`).join("\n")}`;
  if (type === "slack") return { url: required(config, "url"), body: JSON.stringify({ text: markdown, unfurl_links: false }) };
  if (type === "microsoft_teams") return { url: required(config, "url"), body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", text: summary.title, weight: "Bolder", size: "Large" }, { type: "TextBlock", text: markdown, wrap: true }] } }] }) };
  if (type === "discord") return { url: required(config, "url"), body: JSON.stringify({ content: markdown.slice(0, 1_900), allowed_mentions: { parse: [] } }) };
  if (type === "webhook") {
    const body = JSON.stringify({ source: "outside_guardian", ...payload });
    const secret = config.secret;
    return { url: required(config, "url"), body, headers: secret ? { "x-outside-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } : undefined };
  }
  if (type === "jira") {
    const base = required(config, "baseUrl").replace(/\/$/, "");
    const authorization = Buffer.from(`${required(config, "email")}:${required(config, "apiToken")}`).toString("base64");
    return { url: `${base}/rest/api/3/issue`, headers: { authorization: `Basic ${authorization}` }, body: JSON.stringify({ fields: { project: { key: required(config, "projectKey") }, issuetype: { name: config.issueType || "Task" }, summary: `[Guardian] ${safeWorkflowText(summary.title)}`.slice(0, 250), description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: safeWorkflowText(`${summary.text}\n${summary.items.map((item) => `${item.severity}: ${item.title} — ${item.detail}`).join("\n")}`).slice(0, 20_000) }] }] } } }) };
  }
  if (type === "github_issues") return { url: `https://api.github.com/repos/${encodeURIComponent(required(config, "owner"))}/${encodeURIComponent(required(config, "repo"))}/issues`, headers: { authorization: `Bearer ${required(config, "token")}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, body: JSON.stringify({ title: `[Guardian] ${summary.title}`.slice(0, 250), body: markdown }) };
  return { url: "https://api.linear.app/graphql", headers: { authorization: required(config, "apiKey") }, body: JSON.stringify({ query: "mutation GuardianIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success } }", variables: { input: { teamId: required(config, "teamId"), title: `[Guardian] ${summary.title}`.slice(0, 250), description: markdown } } }) };
}

export async function deliverGuardianBatch(store: GuardianStore, limit = 20): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  recordGuardianQueueMetrics(await store.queueMetrics(now));
  const jobs = await store.claimDeliveries(now, limit, 60_000);
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const started = Date.now();
    try {
      if (job.channelType === "email") await getEmailProvider().send(job.payload as EmailPayload);
      else {
        if (!job.encryptedConfig) throw new Error("Integration is disabled or its configuration is unavailable.");
        // Bound to the owning organization: a config row lifted into another
        // tenant will not open. Rows written before v2 are unbound and still do.
        const config = decryptGuardianConfig<Config>(job.encryptedConfig, channelAssociatedData(job.orgId));
        await safeGuardianPost(requestFor(job.channelType, config, job.payload as EventPayload | DigestPayload), AbortSignal.timeout(12_000));
      }
      await store.completeDelivery(job.id, job.leaseId, new Date());
      recordGuardianDelivery(job, "sent", Date.now() - started);
      sent += 1;
    } catch (error) {
      const retryMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      await store.failDelivery(job.id, job.leaseId, (error as Error).message, new Date(Date.now() + retryMinutes * 60_000));
      recordGuardianDelivery(job, "failed", Date.now() - started);
      failed += 1;
    }
  }
  return { sent, failed };
}
