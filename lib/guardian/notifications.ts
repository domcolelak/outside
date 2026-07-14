import { createHmac } from "node:crypto";
import { getAuthStore } from "@/lib/auth";
import { getEmailProvider } from "@/lib/email/provider";
import { decryptGuardianConfig } from "./crypto";
import { safeGuardianPost, type GuardianHttpRequest } from "./transport";
import type { GuardianStore } from "./store-model";
import type { GuardianAnalysis, GuardianChannelType, GuardianDigest, GuardianEvent } from "./types";

type Config = Record<string, string>;
interface EventPayload { kind: "event_group"; target: string; scanId: string; observedAt: string; events: GuardianEvent[] }
interface DigestPayload { kind: "weekly_digest"; digest: GuardianDigest }
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
  const payload: EventPayload = { kind: "event_group", target: analysis.snapshot.target, scanId: analysis.snapshot.scanId, observedAt: analysis.snapshot.observedAt, events };
  const channels = (await store.channels(analysis.snapshot.orgId)).filter((channel) => channel.enabled);
  const auth = await getAuthStore();
  const members = await auth.orgMembers(analysis.snapshot.orgId);
  const recipients = members.filter((member) => member.role !== "viewer" && member.notifyChanges);
  const jobs = [
    ...channels.map((channel) => store.queueDelivery({ idempotencyKey: `guardian:event:${analysis.snapshot.orgId}:${analysis.snapshot.scanId}:${channel.id}`, orgId: analysis.snapshot.orgId, channelId: channel.id, channelType: channel.type, target: analysis.snapshot.target, kind: "event_group", itemCount: events.length, payload })),
    ...recipients.map((member) => store.queueDelivery({ idempotencyKey: `guardian:event:${analysis.snapshot.orgId}:${analysis.snapshot.scanId}:email:${member.email.toLowerCase()}`, orgId: analysis.snapshot.orgId, channelId: null, channelType: "email", target: analysis.snapshot.target, kind: "event_group", itemCount: events.length, payload: eventEmail(member.email, payload) })),
  ];
  await Promise.all(jobs);
  return jobs.length;
}

export async function queueGuardianDigestNotifications(store: GuardianStore, digest: GuardianDigest): Promise<number> {
  const channels = (await store.channels(digest.orgId)).filter((channel) => channel.enabled);
  const members = await (await getAuthStore()).orgMembers(digest.orgId);
  const recipients = members.filter((member) => member.role !== "viewer" && member.notifyChanges);
  const payload: DigestPayload = { kind: "weekly_digest", digest };
  const jobs = [
    ...channels.map((channel) => store.queueDelivery({ idempotencyKey: `guardian:digest:${digest.orgId}:${digest.target}:${digest.weekOf}:${channel.id}`, orgId: digest.orgId, channelId: channel.id, channelType: channel.type, target: digest.target, kind: "weekly_digest", itemCount: digest.reviewItems.length, payload })),
    ...recipients.map((member) => store.queueDelivery({ idempotencyKey: `guardian:digest:${digest.orgId}:${digest.target}:${digest.weekOf}:email:${member.email.toLowerCase()}`, orgId: digest.orgId, channelId: null, channelType: "email", target: digest.target, kind: "weekly_digest", itemCount: digest.reviewItems.length, payload: digestEmail(member.email, digest) })),
  ];
  await Promise.all(jobs);
  return jobs.length;
}

function eventEmail(to: string, payload: EventPayload): EmailPayload {
  const lines = payload.events.map((event) => `${event.severity.toUpperCase()}: ${event.title}\n${event.summary}\nWhy: ${event.why}`);
  const text = `OUTSIDE Guardian grouped ${payload.events.length} important change(s) for ${payload.target}.\n\n${lines.join("\n\n")}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;background:#07100d;color:#eaf7f0;padding:32px"><p style="color:#76e6a8;letter-spacing:.12em">OUTSIDE GUARDIAN</p><h1>${payload.events.length} important change${payload.events.length === 1 ? "" : "s"}</h1><p>${escapeHtml(payload.target)}</p>${payload.events.map((event) => `<div style="margin:18px 0;padding:16px;border:1px solid #244339;border-radius:12px"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.summary)}</p><small>${escapeHtml(event.why)}</small></div>`).join("")}</div>`;
  return { to, subject: `Guardian: ${payload.events.length} important change${payload.events.length === 1 ? "" : "s"} for ${payload.target}`, text, html };
}

function digestEmail(to: string, digest: GuardianDigest): EmailPayload {
  const text = `${digest.headline}\n\n${digest.executiveSummary}\n\nReview:\n${digest.reviewItems.map((item) => `- ${item.title}: ${item.detail}`).join("\n")}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;background:#07100d;color:#eaf7f0;padding:32px"><p style="color:#76e6a8;letter-spacing:.12em">OUTSIDE GUARDIAN · WEEKLY</p><h1>${escapeHtml(digest.headline)}</h1><p>${escapeHtml(digest.executiveSummary)}</p><div style="display:flex;gap:12px"><b>${digest.newAssets} new</b><b>${digest.importantChanges} important</b><b>${digest.shadowAssets} shadow</b></div>${digest.reviewItems.map((item) => `<div style="margin-top:16px;padding:14px;border-left:3px solid #76e6a8"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join("")}</div>`;
  return { to, subject: `Guardian weekly: ${digest.headline}`, text, html };
}

function concisePayload(payload: EventPayload | DigestPayload) {
  if (payload.kind === "weekly_digest") return { title: payload.digest.headline, text: payload.digest.executiveSummary, target: payload.digest.target, items: payload.digest.reviewItems.map((item) => ({ title: item.title, detail: item.detail, severity: item.severity })) };
  return { title: `${payload.events.length} important Guardian change(s)`, text: `External changes observed for ${payload.target}`, target: payload.target, items: payload.events.map((event) => ({ title: event.title, detail: event.summary, severity: event.severity })) };
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
  const jobs = await store.claimDeliveries(new Date(), limit, 60_000);
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      if (job.channelType === "email") await getEmailProvider().send(job.payload as EmailPayload);
      else {
        if (!job.encryptedConfig) throw new Error("Integration is disabled or its configuration is unavailable.");
        const config = decryptGuardianConfig<Config>(job.encryptedConfig);
        await safeGuardianPost(requestFor(job.channelType, config, job.payload as EventPayload | DigestPayload), AbortSignal.timeout(12_000));
      }
      await store.completeDelivery(job.id, job.leaseId, new Date());
      sent += 1;
    } catch (error) {
      const retryMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      await store.failDelivery(job.id, job.leaseId, (error as Error).message, new Date(Date.now() + retryMinutes * 60_000));
      failed += 1;
    }
  }
  return { sent, failed };
}
