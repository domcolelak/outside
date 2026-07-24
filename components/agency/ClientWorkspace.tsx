"use client";
import { useCallback, useEffect, useState } from "react";
import type {
  AgencyClient,
  AgencyFindingShare,
  AgencyGroup,
  AgencyNote,
  AgencySlaEvent,
  AgencyWorkspace,
} from "@/lib/agency/types";
import type { GuardianOverview } from "@/lib/guardian/types";

type Detail = {
  workspace: AgencyWorkspace;
  client: AgencyClient;
  guardian: GuardianOverview;
  notes: AgencyNote[];
  shares: AgencyFindingShare[];
  sla: AgencySlaEvent[];
  role: string;
};
const input =
  "w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm outline-hidden focus:border-signal/40";
function SlaQueue({
  events,
  recommendations,
  onAction,
}: {
  events: AgencySlaEvent[];
  recommendations: GuardianOverview["recommendations"];
  onAction: (id: string, action: "acknowledge" | "resolve") => Promise<boolean>;
}) {
  const open = events.filter((item) => item.status !== "resolved");
  return (
    <section className="panel p-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono text-[10px] uppercase text-ink-faint">
            Service-level workflow
          </div>
          <h2 className="mt-1 text-lg font-medium">SLA queue</h2>
        </div>
        <span className="text-xs text-risk-high">
          {open.filter((item) => item.breached).length} breached
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {open.map((item) => (
          <div
            key={item.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${item.breached ? "border-risk-high/30" : "border-line"}`}
          >
            <div>
              <div className="text-sm">
                {recommendations.find(
                  (candidate) => candidate.id === item.findingId,
                )?.title ?? item.findingId}
              </div>
              <div className="mono mt-1 text-[9px] uppercase text-ink-faint">
                {item.priority} · due {new Date(item.dueAt).toLocaleString()} ·{" "}
                {item.status}
              </div>
            </div>
            <div className="flex gap-2">
              {item.status === "open" && (
                <button
                  onClick={() => onAction(item.id, "acknowledge")}
                  className="rounded-sm border border-line px-3 py-1 text-[10px]"
                >
                  Acknowledge
                </button>
              )}
              <button
                onClick={() => onAction(item.id, "resolve")}
                className="rounded-sm border border-signal/30 px-3 py-1 text-[10px] text-signal"
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
        {!open.length && (
          <p className="text-sm text-ink-faint">No open SLA items.</p>
        )}
      </div>
    </section>
  );
}
export function ClientWorkspace({
  agencyId,
  clientId,
}: {
  agencyId: string;
  clientId: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [groups, setGroups] = useState<AgencyGroup[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [detail, groupData] = await Promise.all([
      fetch(`/api/agency/clients/${clientId}?agencyId=${agencyId}`).then(
        (response) => response.json(),
      ),
      fetch(`/api/agency/groups?agencyId=${agencyId}`).then((response) =>
        response.json(),
      ),
    ]);
    setData(detail);
    setGroups(groupData.groups ?? []);
  }, [agencyId, clientId]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);
  async function post(
    url: string,
    body: Record<string, unknown>,
    method = "POST",
  ) {
    setMessage("");
    const response = await fetch(`${url}?agencyId=${agencyId}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage(response.ok ? "Saved" : (result.error ?? "Operation failed"));
    if (response.ok) await load();
    return response.ok;
  }
  if (!data)
    return (
      <div className="panel p-8 text-ink-soft">Loading client workspace…</div>
    );
  const shared = new Set(data.shares.map((item) => item.recommendationId));
  const routing = data.client.notificationRouting as {
    emails?: string[];
    channelIds?: string[];
    severities?: string[];
  };
  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden p-6">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[.2em] text-signal">
              {data.workspace.consultantMode
                ? "Consultant engagement"
                : "Managed service client"}
            </div>
            <h1 className="mt-2 text-4xl font-semibold text-gradient">
              {data.client.organizationName}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              {data.guardian.targets.length} monitored targets ·{" "}
              {data.client.serviceTier} service ·{" "}
              {data.client.slaResponseMinutes} minute SLA
            </p>
          </div>
          <div className="mono text-[10px] text-ink-faint">
            Portal: {data.client.portalMode} · Billing:{" "}
            {data.client.billingMode}
          </div>
        </div>
      </section>
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message === "Saved" ? "border-signal/20 text-signal" : "border-risk-high/30 text-risk-high"}`}
        >
          {message}
        </div>
      )}
      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <form
          className="panel p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await post(
              "/api/agency/clients",
              {
                clientId,
                status: form.get("status"),
                portalMode: form.get("portalMode"),
                groupId: form.get("groupId"),
                serviceTier: form.get("serviceTier"),
                slaResponseMinutes: form.get("sla"),
                billingMode: form.get("billingMode"),
                monthlyPriceCents: Math.round(Number(form.get("price")) * 100),
                currency: form.get("currency"),
                notificationRouting: {
                  emails: String(form.get("emails") ?? "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  channelIds: String(form.get("channels") ?? "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  severities: form.getAll("severities"),
                },
              },
              "PATCH",
            );
          }}
        >
          <h2 className="text-lg font-medium">Client configuration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              Status
              <select
                name="status"
                defaultValue={data.client.status}
                className={`${input} mt-1`}
              >
                <option>onboarding</option>
                <option>active</option>
                <option>paused</option>
                <option>offboarded</option>
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              Portal
              <select
                name="portalMode"
                defaultValue={data.client.portalMode}
                className={`${input} mt-1`}
              >
                <option>disabled</option>
                <option>readonly</option>
                <option>collaborative</option>
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              Group
              <select
                name="groupId"
                defaultValue={data.client.groupId ?? ""}
                className={`${input} mt-1`}
              >
                <option value="">Ungrouped</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              Service tier
              <input
                name="serviceTier"
                defaultValue={data.client.serviceTier}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              SLA response minutes
              <input
                name="sla"
                type="number"
                min="15"
                defaultValue={data.client.slaResponseMinutes}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Billing mode
              <select
                name="billingMode"
                defaultValue={data.client.billingMode}
                className={`${input} mt-1`}
              >
                <option value="agency">Agency paid</option>
                <option value="direct">Client direct</option>
                <option value="reseller">Reseller</option>
              </select>
            </label>
            {!data.workspace.consultantMode && (
              <>
                <label className="text-xs text-ink-soft">
                  Monthly price
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={(data.client.monthlyPriceCents ?? 0) / 100}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="text-xs text-ink-soft">
                  Currency
                  <input
                    name="currency"
                    maxLength={3}
                    defaultValue={data.client.currency}
                    className={`${input} mt-1`}
                  />
                </label>
              </>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="mono text-[10px] uppercase text-ink-faint">
              Client-specific notification routing
            </div>
            <label className="mt-3 block text-xs text-ink-soft">
              Email recipients
              <input
                name="emails"
                defaultValue={(routing.emails ?? []).join(", ")}
                placeholder="soc@client.com, ciso@client.com"
                className={`${input} mt-1`}
              />
            </label>
            <label className="mt-3 block text-xs text-ink-soft">
              Guardian channel IDs
              <input
                name="channels"
                defaultValue={(routing.channelIds ?? []).join(", ")}
                placeholder="Channel IDs, comma separated"
                className={`${input} mt-1`}
              />
            </label>
            <div className="mt-3 flex gap-4">
              {["critical", "high", "medium"].map((severity) => (
                <label key={severity} className="text-xs">
                  <input
                    type="checkbox"
                    name="severities"
                    value={severity}
                    defaultChecked={(
                      routing.severities ?? ["critical", "high"]
                    ).includes(severity)}
                    className="mr-1 accent-signal"
                  />
                  {severity}
                </label>
              ))}
            </div>
          </div>
          <button className="mt-5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">
            Save client
          </button>
        </form>
        <div className="space-y-6">
          <div className="panel p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-medium">Analyst notes</h2>
                <p className="mt-1 text-xs text-ink-faint">
                  Internal by default. Shared notes are visible in the client
                  portal.
                </p>
              </div>
            </div>
            <form
              className="mt-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (
                  await post("/api/agency/notes", {
                    clientId,
                    body: form.get("body"),
                    visibility: form.get("visibility"),
                  })
                )
                  event.currentTarget.reset();
              }}
            >
              <textarea
                aria-label="Analyst note"
                name="body"
                required
                maxLength={5000}
                className={`${input} min-h-24`}
                placeholder="Add evidence-backed context, decisions or follow-up…"
              />
              <div className="mt-2 flex justify-between">
                <select
                  aria-label="Note visibility"
                  name="visibility"
                  className="rounded-sm border border-line bg-base-950 px-2 text-xs"
                >
                  <option value="internal">Internal only</option>
                  <option value="shared">Share with client</option>
                </select>
                <button className="rounded-sm border border-signal/30 px-3 py-2 text-xs text-signal">
                  Add note
                </button>
              </div>
            </form>
            <div className="mt-4 space-y-2">
              {data.notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-line p-3"
                >
                  <div className="text-xs leading-5 text-ink-soft">
                    {note.body}
                  </div>
                  <div className="mono mt-2 text-[9px] uppercase text-ink-faint">
                    {note.visibility} ·{" "}
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="text-lg font-medium">Client portal and reporting</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  post("/api/agency/operations", {
                    type: "report",
                    clientOrgIds: [data.client.orgId],
                  })
                }
                className="rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950"
              >
                Generate branded report
              </button>
              <button
                onClick={() =>
                  post("/api/agency/operations", {
                    type: "digest",
                    clientOrgIds: [data.client.orgId],
                  })
                }
                className="rounded-lg border border-line px-4 py-2 text-xs"
              >
                Generate executive digest
              </button>
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (
                  await post("/api/agency/invites", {
                    kind: "client_portal",
                    clientId,
                    email: form.get("email"),
                    role: "viewer",
                  })
                )
                  event.currentTarget.reset();
              }}
            >
              <input
                aria-label="Client portal invitation email"
                name="email"
                type="email"
                required
                placeholder="client@example.com"
                className={input}
              />
              <button className="rounded-lg border border-signal/30 px-3 text-xs text-signal">
                Invite to portal
              </button>
            </form>
          </div>
        </div>
      </section>
      <SlaQueue
        events={data.sla}
        recommendations={data.guardian.recommendations}
        onAction={(id, action) =>
          post("/api/agency/sla", { id, action }, "PATCH")
        }
      />
      <section className="panel p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[10px] uppercase text-ink-faint">
              Shared findings workflow
            </div>
            <h2 className="mt-1 text-lg font-medium">
              Guardian recommendations
            </h2>
          </div>
          <span className="text-xs text-ink-faint">
            {shared.size} shared with client
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.guardian.recommendations
            .filter((item) => !["resolved", "dismissed"].includes(item.status))
            .map((recommendation) => (
              <article
                key={recommendation.id}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex justify-between gap-3">
                  <h3 className="text-sm">{recommendation.title}</h3>
                  <span className="mono text-[9px] uppercase text-risk-high">
                    {recommendation.priority}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  {recommendation.why}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-ink-faint">
                    {recommendation.affectedAssets.length} affected assets ·{" "}
                    {Math.round(recommendation.confidence * 100)}% confidence
                  </span>
                  {shared.has(recommendation.id) ? (
                    <span className="mono text-[9px] uppercase text-signal">
                      Shared
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        post("/api/agency/findings", {
                          clientId,
                          recommendationId: recommendation.id,
                          clientMessage: recommendation.suggestedReview,
                        })
                      }
                      className="rounded-sm border border-signal/30 px-3 py-1.5 text-[10px] text-signal"
                    >
                      Share with client
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
