import { isIP } from "node:net";
import { isSafePublicIp } from "@/lib/security/target";
import type { GuardianChannelType } from "./types";

const MAX_SECRET = 8_192;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Integration configuration must be an object.");
  return value as Record<string, unknown>;
}

function text(input: Record<string, unknown>, key: string, max = MAX_SECRET): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required and must be at most ${max} characters.`);
  return value.trim();
}

function endpoint(value: string, allowedHosts?: RegExp): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Integration endpoints must use standard HTTPS without embedded credentials.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private integration endpoints are not supported.");
  if (isIP(host) && !isSafePublicIp(host)) throw new Error("Private integration endpoints are not supported.");
  if (allowedHosts && !allowedHosts.test(host)) throw new Error("The endpoint does not match the selected integration provider.");
  return url;
}

export function validateGuardianChannelConfig(type: GuardianChannelType, value: unknown): { config: Record<string, string>; destinationHint: string } {
  const input = object(value);
  if (type === "slack") {
    const url = endpoint(text(input, "url"), /^hooks\.slack\.com$/);
    return { config: { url: url.toString() }, destinationHint: "Slack webhook" };
  }
  if (type === "microsoft_teams") {
    const url = endpoint(text(input, "url"), /(?:\.webhook\.office\.com|\.logic\.azure\.com|^webhook\.office\.com)$/);
    return { config: { url: url.toString() }, destinationHint: "Microsoft Teams workflow" };
  }
  if (type === "discord") {
    const url = endpoint(text(input, "url"), /^(?:canary\.)?(?:discord(?:app)?\.com)$/);
    if (!url.pathname.startsWith("/api/webhooks/")) throw new Error("Discord requires an incoming webhook URL.");
    return { config: { url: url.toString() }, destinationHint: "Discord webhook" };
  }
  if (type === "webhook") {
    const url = endpoint(text(input, "url"));
    const secret = typeof input.secret === "string" && input.secret.trim() ? text(input, "secret") : undefined;
    return { config: { url: url.toString(), ...(secret ? { secret } : {}) }, destinationHint: `${url.hostname}${url.pathname}`.slice(0, 120) };
  }
  if (type === "jira") {
    const url = endpoint(text(input, "baseUrl"));
    const config = { baseUrl: `${url.origin}${url.pathname.replace(/\/$/, "")}`, email: text(input, "email", 320), apiToken: text(input, "apiToken"), projectKey: text(input, "projectKey", 32).toUpperCase(), issueType: typeof input.issueType === "string" && input.issueType.trim() ? text(input, "issueType", 80) : "Task" };
    return { config, destinationHint: `${url.hostname} · ${config.projectKey}` };
  }
  if (type === "github_issues") {
    const owner = text(input, "owner", 100);
    const repo = text(input, "repo", 100);
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GitHub owner and repository are invalid.");
    return { config: { owner, repo, token: text(input, "token") }, destinationHint: `${owner}/${repo}` };
  }
  const teamId = text(input, "teamId", 100);
  return { config: { teamId, apiKey: text(input, "apiKey") }, destinationHint: `Linear team ${teamId.slice(0, 12)}` };
}
