"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AgencyApiKey,
  AgencyClient,
  AgencyGroup,
  AgencyInvite,
  AgencyMembership,
  AgencyReport,
  AgencyRole,
  AgencyWorkspace,
} from "@/lib/agency/types";
import { hasAgencyPermission } from "@/lib/agency/types";
import { AgencyAnalytics } from "./AgencyAnalytics";

type AdminData = {
  workspace: AgencyWorkspace;
  clients: AgencyClient[];
  groups: AgencyGroup[];
  members: AgencyMembership[];
  invites: AgencyInvite[];
  reports: AgencyReport[];
  keys: AgencyApiKey[];
};
const input =
  "w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink outline-hidden focus:border-signal/40";
function ReportDelivery({
  agencyId,
  reportId,
}: {
  agencyId: string;
  reportId: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const recipient = String(
          new FormData(event.currentTarget).get("recipient") ?? "",
        );
        const response = await fetch(
          `/api/agency/reports/${reportId}?agencyId=${agencyId}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ to: recipient }),
          },
        );
        setStatus(response.ok ? "Queued" : "Failed");
      }}
    >
      <input
        name="recipient"
        type="email"
        required
        aria-label="Report recipient"
        placeholder="client@example.com"
        className="min-w-0 flex-1 rounded-sm border border-line bg-base-950 px-2 py-1 text-[11px]"
      />
      <button className="rounded-sm border border-line px-2 text-[11px]">
        Send
      </button>
      {status && (
        <span className="self-center text-[11px] text-ink-faint">{status}</span>
      )}
    </form>
  );
}
function BulkScheduler({
  agencyId,
  clients,
}: {
  agencyId: string;
  clients: AgencyClient[];
}) {
  const [status, setStatus] = useState("");
  return (
    <form
      className="panel p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget),
          clientOrgIds = form.getAll("clients");
        if (!clientOrgIds.length) return setStatus("Select clients");
        const response = await fetch(
          `/api/agency/operations?agencyId=${agencyId}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": `scheduled-scan:${String(form.get("scheduledFor"))}:${clientOrgIds.sort().join(",")}`,
            },
            body: JSON.stringify({
              type: "scan",
              clientOrgIds,
              scheduledFor: form.get("scheduledFor"),
            }),
          },
        );
        setStatus(
          response.ok
            ? "Scan schedule saved"
            : ((await response.json()).error ?? "Failed"),
        );
      }}
    >
      <h2 className="text-lg font-medium">Bulk scan scheduling</h2>
      <p className="mt-1 text-xs text-ink-faint">
        Schedule existing verified monitors up to 30 days ahead.
      </p>
      <input
        aria-label="Scheduled scan time"
        name="scheduledFor"
        type="datetime-local"
        required
        className={`${input} mt-4 max-w-sm`}
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <label
            key={client.id}
            className="rounded-sm border border-line p-2 text-xs"
          >
            <input
              name="clients"
              type="checkbox"
              value={client.orgId}
              className="mr-2 accent-signal"
            />
            {client.organizationName}
          </label>
        ))}
      </div>
      <button className="mt-4 rounded-sm bg-signal px-4 py-2 text-xs font-semibold text-base-950">
        Save schedule
      </button>
      {status && <span className="ml-3 text-xs text-ink-soft">{status}</span>}
    </form>
  );
}
function SeatRoleEditor({
  members,
  mutate,
}: {
  members: AgencyMembership[];
  mutate: (
    url: string,
    method: string,
    body: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  return (
    <section className="panel p-5">
      <h2 className="text-lg font-medium">Seat role management</h2>
      <div className="mt-4 grid gap-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="grid items-center gap-2 rounded-sm border border-line p-3 sm:grid-cols-[1fr_140px_auto]"
          >
            <span className="mono text-xs">{member.userId}</span>
            <select
              aria-label={`Role for member ${member.userId}`}
              defaultValue={member.role}
              disabled={member.role === "owner"}
              onChange={(event) =>
                mutate("/api/agency/invites", "PATCH", {
                  userId: member.userId,
                  role: event.target.value,
                })
              }
              className="rounded-sm border border-line bg-base-950 px-2 py-1 text-xs"
            >
              <option>admin</option>
              <option>manager</option>
              <option>analyst</option>
              <option>billing</option>
              <option>viewer</option>
              {member.role === "owner" && <option>owner</option>}
            </select>
            <span
              className={`mono text-[11px] uppercase ${member.active ? "text-signal" : "text-ink-faint"}`}
            >
              {member.active ? "active" : "inactive"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AgencyAdmin({
  agencyId,
  role,
}: {
  agencyId: string;
  role: AgencyRole;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const load = useCallback(async () => {
    const [portfolio, groups, team, operations, keys] = await Promise.all([
      fetch(`/api/agency?agencyId=${agencyId}`).then((response) =>
        response.json(),
      ),
      fetch(`/api/agency/groups?agencyId=${agencyId}`).then((response) =>
        response.json(),
      ),
      fetch(`/api/agency/invites?agencyId=${agencyId}`).then((response) =>
        response.json(),
      ),
      fetch(`/api/agency/operations?agencyId=${agencyId}`).then((response) =>
        response.json(),
      ),
      fetch(`/api/agency/api-keys?agencyId=${agencyId}`).then((response) =>
        response.ok ? response.json() : { keys: [] },
      ),
    ]);
    setData({
      workspace: portfolio.workspace,
      clients: portfolio.clients.map(
        (item: { client: AgencyClient }) => item.client,
      ),
      groups: groups.groups ?? [],
      members: team.members ?? [],
      invites: team.invites ?? [],
      reports: operations.reports ?? [],
      keys: keys.keys ?? [],
    });
  }, [agencyId]);
  useEffect(() => {
    // A timeout, not requestAnimationFrame: rAF never fires in a background tab,
    // which would leave this view loading forever.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function mutate(
    url: string,
    method: string,
    body: Record<string, unknown>,
  ) {
    setMessage("");
    const response = await fetch(
      `${url}${url.includes("?") ? "&" : "?"}agencyId=${agencyId}`,
      {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "Operation failed");
      return null;
    }
    setMessage("Saved");
    await load();
    return result;
  }
  if (!data)
    return (
      <div className="panel p-8 text-sm text-ink-soft">
        Loading Agency Operations Center…
      </div>
    );
  const mrr = data.clients.reduce(
    (sum, client) => sum + (client.monthlyPriceCents ?? 0),
    0,
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mono text-[11px] uppercase tracking-[.2em] text-signal">
            Agency Operations Center
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-gradient">
            Manage {data.workspace.name}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Clients, service delivery, brand, seats, reports and API access.
          </p>
        </div>
        <div className="mono text-[11px] text-ink-faint">
          {role} · {(mrr / 100).toLocaleString()}{" "}
          {data.clients[0]?.currency ?? "EUR"} managed MRR
        </div>
      </div>
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message === "Saved" ? "border-signal/20 bg-signal/5 text-signal" : "border-risk-high/30 text-risk-high"}`}
        >
          {message}
        </div>
      )}
      <section className="grid gap-6 xl:grid-cols-2">
        <form
          className="panel p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await mutate("/api/agency", "PATCH", {
              name: form.get("name"),
              consultantMode: form.get("consultantMode") === "on",
              resellerParentId: form.get("resellerParentId"),
              branding: {
                whiteLabel: form.get("whiteLabel") === "on",
                logoUrl: form.get("logoUrl"),
                primaryColor: form.get("primaryColor"),
                accentColor: form.get("accentColor"),
                supportEmail: form.get("supportEmail"),
                customDomain: form.get("customDomain"),
                emailFromName: form.get("emailFromName"),
                emailFooter: form.get("emailFooter"),
              },
            });
          }}
        >
          <h2 className="text-lg font-medium">Brand and operating mode</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              Agency name
              <input
                name="name"
                defaultValue={data.workspace.name}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Logo URL
              <input
                name="logoUrl"
                type="url"
                defaultValue={data.workspace.branding.logoUrl ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Primary color
              <input
                name="primaryColor"
                type="color"
                defaultValue={data.workspace.branding.primaryColor}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Accent color
              <input
                name="accentColor"
                type="color"
                defaultValue={data.workspace.branding.accentColor}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Support email
              <input
                name="supportEmail"
                type="email"
                defaultValue={data.workspace.branding.supportEmail ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Verified custom domain
              <input
                name="customDomain"
                defaultValue={data.workspace.branding.customDomain ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Email sender
              <input
                name="emailFromName"
                defaultValue={data.workspace.branding.emailFromName ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Reseller parent ID
              <input
                name="resellerParentId"
                defaultValue={data.workspace.resellerParentId ?? ""}
                className={`${input} mt-1`}
              />
            </label>
          </div>
          <label className="mt-3 block text-xs text-ink-soft">
            Email footer
            <textarea
              name="emailFooter"
              defaultValue={data.workspace.branding.emailFooter ?? ""}
              className={`${input} mt-1 min-h-20`}
            />
          </label>
          <div className="mt-4 flex gap-5">
            <label className="text-xs">
              <input
                type="checkbox"
                name="whiteLabel"
                defaultChecked={data.workspace.branding.whiteLabel}
                className="mr-2 accent-signal"
              />
              White-label mode
            </label>
            <label className="text-xs">
              <input
                type="checkbox"
                name="consultantMode"
                defaultChecked={data.workspace.consultantMode}
                className="mr-2 accent-signal"
              />
              Consultant mode
            </label>
          </div>
          <button className="mt-5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">
            Save workspace
          </button>
        </form>
        <div className="panel p-5">
          <h2 className="text-lg font-medium">Customer groups</h2>
          <form
            className="mt-4 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (
                await mutate("/api/agency/groups", "POST", {
                  name: form.get("name"),
                  color: form.get("color"),
                  description: form.get("description"),
                })
              )
                event.currentTarget.reset();
            }}
          >
            <input
              aria-label="Group name"
              name="name"
              required
              placeholder="Group name"
              className={input}
            />
            <input
              aria-label="Group color"
              name="color"
              type="color"
              defaultValue="#5b8cff"
              className="w-28 rounded-lg border border-line bg-base-950 px-2"
            />
            <button className="rounded-lg border border-signal/30 px-4 text-xs text-signal">
              Add
            </button>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-line p-3">
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ background: group.color }}
                />
                <span className="text-sm">{group.name}</span>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {
                    data.clients.filter((client) => client.groupId === group.id)
                      .length
                  }{" "}
                  clients
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">
              Clients and service delivery
            </h2>
            <p className="mt-1 text-xs text-ink-faint">
              Routing, SLA, reports, notes and shared findings live in each
              client workspace.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.clients.map((client) => (
            <Link
              key={client.id}
              href={`/agency/client/${client.id}?agencyId=${agencyId}`}
              className="rounded-xl border border-line p-4 hover:border-signal/30"
            >
              <div className="font-medium">{client.organizationName}</div>
              <div className="mono mt-1 text-[11px] uppercase text-ink-faint">
                {data.groups.find((group) => group.id === client.groupId)
                  ?.name ?? "Ungrouped"}{" "}
                · {client.serviceTier}
              </div>
              <div className="mt-4 flex justify-between text-[11px] text-ink-soft">
                <span>{client.portalMode} portal</span>
                <span>{client.slaResponseMinutes}m SLA</span>
                <span>{client.billingMode}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-lg font-medium">Seats and invitations</h2>
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_130px_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (
                await mutate("/api/agency/invites", "POST", {
                  email: form.get("email"),
                  role: form.get("role"),
                  kind: "seat",
                })
              )
                event.currentTarget.reset();
            }}
          >
            <input
              aria-label="Seat invitation email"
              name="email"
              type="email"
              required
              placeholder="analyst@agency.com"
              className={input}
            />
            <select aria-label="Seat role" name="role" className={input}>
              <option>analyst</option>
              <option>manager</option>
              <option>admin</option>
              <option>billing</option>
              <option>viewer</option>
            </select>
            <button className="rounded-lg bg-signal px-4 text-xs font-semibold text-base-950">
              Invite
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {data.members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-lg border border-line p-3"
              >
                <div>
                  <div className="mono text-xs">{member.userId}</div>
                  <div className="text-[11px] text-ink-faint">
                    {member.role} · {member.active ? "active" : "inactive"}
                  </div>
                </div>
                {member.role !== "owner" && (
                  <button
                    onClick={() =>
                      mutate("/api/agency/invites", "PATCH", {
                        userId: member.userId,
                        active: !member.active,
                      })
                    }
                    className="rounded-sm border border-line px-2 py-1 text-[11px]"
                  >
                    {member.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-ink-faint">
            {data.invites.filter((invite) => !invite.acceptedAt).length} pending
            invitations
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-medium">Agency API</h2>
          <form
            className="mt-4 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const result = await mutate("/api/agency/api-keys", "POST", {
                name: form.get("name"),
                scopes: [
                  "agency:read",
                  "clients:read",
                  "operations:run",
                  "reports:generate",
                ],
              });
              if (result?.token) setSecret(result.token);
            }}
          >
            <input
              aria-label="API key name"
              name="name"
              required
              placeholder="Automation key"
              className={input}
            />
            <button className="rounded-lg border border-signal/30 px-4 text-xs text-signal">
              Create key
            </button>
          </form>
          {secret && (
            <div className="mt-3 rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3">
              <div className="text-[11px] text-risk-medium">
                Copy now — shown once
              </div>
              <code className="mt-2 block break-all text-xs">{secret}</code>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {data.keys.map((key) => (
              <div
                key={key.id}
                className="flex justify-between rounded-lg border border-line p-3 text-xs"
              >
                <span>
                  {key.name} · {key.prefix}
                </span>
                <button
                  onClick={() =>
                    mutate("/api/agency/api-keys", "DELETE", { id: key.id })
                  }
                  className="text-risk-high"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <BulkScheduler agencyId={agencyId} clients={data.clients} />
        <SeatRoleEditor members={data.members} mutate={mutate} />
      </section>
      <AgencyAnalytics
        agencyId={agencyId}
        canManageBilling={hasAgencyPermission(role, "billing:manage")}
      />
      <section className="panel p-5">
        <h2 className="text-lg font-medium">Report center</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.reports.map((report) => (
            <div key={report.id} className="rounded-xl border border-line p-4">
              <div className="text-sm">{report.title}</div>
              <div className="mono mt-1 text-[11px] uppercase text-ink-faint">
                {report.kind} ·{" "}
                {new Date(report.createdAt).toLocaleDateString()}
              </div>
              <Link
                href={`/api/agency/reports/${report.id}?agencyId=${agencyId}`}
                className="mt-4 inline-block text-xs text-signal"
              >
                Download PDF →
              </Link>
              <ReportDelivery agencyId={agencyId} reportId={report.id} />
            </div>
          ))}
          {!data.reports.length && (
            <p className="text-sm text-ink-faint">
              Generate reports from the portfolio or client workspace.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
