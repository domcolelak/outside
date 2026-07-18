"use client";

import { useState } from "react";
import type { GuardianChannel, GuardianChannelType } from "@/lib/guardian/types";

const labels: Record<GuardianChannelType, string> = { slack: "Slack", microsoft_teams: "Microsoft Teams", discord: "Discord", webhook: "Webhook", jira: "Jira", github_issues: "GitHub Issues", linear: "Linear" };
const fields: Record<GuardianChannelType, Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>> = {
  slack: [{ key: "url", label: "Incoming webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/…" }],
  microsoft_teams: [{ key: "url", label: "Workflow webhook URL", secret: true }],
  discord: [{ key: "url", label: "Incoming webhook URL", secret: true }],
  webhook: [{ key: "url", label: "HTTPS endpoint" }, { key: "secret", label: "Signing secret (optional)", secret: true }],
  jira: [{ key: "baseUrl", label: "Jira site URL", placeholder: "https://company.atlassian.net" }, { key: "email", label: "Account email" }, { key: "apiToken", label: "API token", secret: true }, { key: "projectKey", label: "Project key" }, { key: "issueType", label: "Issue type", placeholder: "Task" }],
  github_issues: [{ key: "owner", label: "Repository owner" }, { key: "repo", label: "Repository" }, { key: "token", label: "Fine-grained token", secret: true }],
  linear: [{ key: "teamId", label: "Team ID" }, { key: "apiKey", label: "API key", secret: true }],
};

export function GuardianIntegrations({ orgId, initialChannels, canAdmin }: { orgId: string; initialChannels: GuardianChannel[]; canAdmin: boolean }) {
  const [channels, setChannels] = useState(initialChannels);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<GuardianChannelType>("slack");
  const [name, setName] = useState("Security operations");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const add = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    const response = await fetch("/api/guardian/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, type, name, config }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Could not create integration.");
    setChannels((rows) => [...rows, data.channel]); setConfig({}); setAdding(false);
  };
  const toggle = async (channel: GuardianChannel) => {
    const response = await fetch(`/api/guardian/channels/${channel.id}?orgId=${encodeURIComponent(orgId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !channel.enabled }) });
    if (response.ok) setChannels((rows) => rows.map((row) => row.id === channel.id ? { ...row, enabled: !row.enabled } : row));
  };
  const remove = async (channel: GuardianChannel) => {
    const response = await fetch(`/api/guardian/channels/${channel.id}?orgId=${encodeURIComponent(orgId)}`, { method: "DELETE" });
    if (response.ok) setChannels((rows) => rows.filter((row) => row.id !== channel.id));
  };

  return <div className="panel p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><div className="mono text-[10px] uppercase tracking-[.18em] text-ink-faint">Notification fabric</div><h2 className="mt-2 text-xl font-medium text-ink">Connected workflows</h2><p className="mt-2 max-w-md text-xs leading-5 text-ink-faint">Important changes are grouped by context. Three related medium events trigger one notification; high severity changes are delivered immediately.</p></div>{canAdmin && <button onClick={() => setAdding((value) => !value)} className="mono shrink-0 rounded-lg border border-signal/20 bg-signal/5 px-3 py-2 text-[10px] uppercase text-signal">{adding ? "Close" : "Connect"}</button>}</div>{adding && <form onSubmit={add} className="mt-5 rounded-xl border border-line bg-base-950/70 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-ink-faint">Provider<select value={type} onChange={(event) => { setType(event.target.value as GuardianChannelType); setConfig({}); }} className="mono mt-1.5 w-full rounded-lg border border-line bg-base-900 px-3 py-2.5 text-xs text-ink">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-ink-faint">Connection name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-lg border border-line bg-base-900 px-3 py-2.5 text-xs text-ink outline-hidden focus:border-signal/30"/></label>{fields[type].map((field) => <label key={field.key} className="text-xs text-ink-faint sm:col-span-2">{field.label}<input type={field.secret ? "password" : "text"} value={config[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setConfig((value) => ({ ...value, [field.key]: event.target.value }))} className="mono mt-1.5 w-full rounded-lg border border-line bg-base-900 px-3 py-2.5 text-xs text-ink outline-hidden placeholder:text-ink-faint focus:border-signal/30"/></label>)}</div>{error && <p className="mono mt-3 text-[10px] text-risk-high">{error}</p>}<div className="mt-4 flex items-center justify-between gap-3"><span className="mono text-[9px] text-ink-faint">Secrets encrypted at rest · HTTPS + IP pinning</span><button className="rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950">Save connection</button></div></form>}<div className="mt-5 space-y-2">{channels.map((channel) => <div key={channel.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-base-950/50 p-3"><div className="flex min-w-0 items-center gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-xs font-semibold ${channel.enabled ? "border-signal/20 bg-signal/5 text-signal" : "border-line text-ink-faint"}`}>{labels[channel.type].slice(0, 2).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-xs font-medium text-ink">{channel.name}</div><div className="mono mt-1 truncate text-[9px] text-ink-faint">{labels[channel.type]} · {channel.destinationHint}</div></div></div>{canAdmin && <div className="flex shrink-0 gap-2"><button onClick={() => void toggle(channel)} className={`mono rounded-md border px-2 py-1 text-[9px] ${channel.enabled ? "border-signal/20 text-signal" : "border-line text-ink-faint"}`}>{channel.enabled ? "Active" : "Paused"}</button><button onClick={() => void remove(channel)} className="mono rounded-md border border-line px-2 py-1 text-[9px] text-ink-faint hover:text-risk-high">Remove</button></div>}</div>)}{channels.length === 0 && <div className="rounded-xl border border-dashed border-line p-7 text-center"><p className="text-xs text-ink-faint">Email is enabled through workspace notification preferences.</p><p className="mono mt-1 text-[9px] text-ink-faint">Connect an operational workflow for grouped Guardian intelligence.</p></div>}</div></div>;
}
