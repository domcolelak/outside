"use client";

import { useTranslator } from "@/lib/i18n/context";
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
const ROLE_KEY = {
  owner: "roleOwner",
  admin: "roleAdmin",
  manager: "roleManager",
  analyst: "roleAnalyst",
  billing: "roleBilling",
  viewer: "roleViewer",
} as const;
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
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
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
        setStatus(response.ok ? g("adminQueued") : g("adminFailed"));
      }}
    >
      <input
        name="recipient"
        type="email"
        required
        aria-label={g("adminReportRecipient")}
        placeholder={g("invitePlaceholder")}
        className="min-w-0 flex-1 rounded-sm border border-line bg-base-950 px-2 py-1 text-[11px]"
      />
      <button className="rounded-sm border border-line px-2 text-[11px]">
        {g("adminSend")}
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
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
  return (
    <form
      className="panel p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget),
          clientOrgIds = form.getAll("clients");
        if (!clientOrgIds.length) return setStatus(g("adminSelectClients"));
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
        setStatus(response.ok ? g("adminScanScheduleSaved") : g("adminFailed"));
      }}
    >
      <h2 className="text-lg font-medium">{g("adminBulkScanHeading")}</h2>
      <p className="mt-1 text-xs text-ink-faint">
        {g("adminBulkScanSubtitle")}
      </p>
      <input
        aria-label={g("adminScheduledScanTime")}
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
        {g("adminSaveSchedule")}
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
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
  return (
    <section className="panel p-5">
      <h2 className="text-lg font-medium">{g("adminSeatRoles")}</h2>
      <div className="mt-4 grid gap-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="grid items-center gap-2 rounded-sm border border-line p-3 sm:grid-cols-[1fr_140px_auto]"
          >
            <span className="mono text-xs">{member.userId}</span>
            <select
              aria-label={g("adminRoleForMember", { member: member.userId })}
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
              <option value="admin">{g("roleAdmin")}</option>
              <option value="manager">{g("roleManager")}</option>
              <option value="analyst">{g("roleAnalyst")}</option>
              <option value="billing">{g("roleBilling")}</option>
              <option value="viewer">{g("roleViewer")}</option>
              {member.role === "owner" && <option value="owner">{g("roleOwner")}</option>}
            </select>
            <span
              className={`mono text-[11px] uppercase ${member.active ? "text-signal" : "text-ink-faint"}`}
            >
              {member.active ? g("adminMemberActive") : g("adminMemberInactive")}
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
  // Outcome and wording travel together; the banner used to compare the text
  // to the literal "Saved", which cannot survive translation.
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState("");
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
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
    setMessage(null);
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
      setMessage({ ok: false, text: g("adminOperationFailed") });
      return null;
    }
    setMessage({ ok: true, text: g("adminSaved") });
    await load();
    return result;
  }
  if (!data)
    return (
      <div className="panel p-8 text-sm text-ink-soft">
        {g("adminLoading")}
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
            {g("adminKicker")}
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-gradient">
            {g("adminManageTitle", { workspace: data.workspace.name })}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {g("adminSubtitle")}
          </p>
        </div>
        <div className="mono text-[11px] text-ink-faint">
          {g("adminManagedMrr", {
            role: ROLE_KEY[role as keyof typeof ROLE_KEY] ? g(ROLE_KEY[role as keyof typeof ROLE_KEY]) : role,
            amount: tr.formatNumber(mrr / 100),
            currency: data.clients[0]?.currency ?? "EUR",
          })}
        </div>
      </div>
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-signal/20 bg-signal/5 text-signal" : "border-risk-high/30 text-risk-high"}`}
        >
          {message.text}
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
          <h2 className="text-lg font-medium">{g("adminBrandHeading")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              {g("adminAgencyName")}
              <input
                name="name"
                defaultValue={data.workspace.name}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminLogoUrl")}
              <input
                name="logoUrl"
                type="url"
                defaultValue={data.workspace.branding.logoUrl ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminPrimaryColor")}
              <input
                name="primaryColor"
                type="color"
                defaultValue={data.workspace.branding.primaryColor}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminAccentColor")}
              <input
                name="accentColor"
                type="color"
                defaultValue={data.workspace.branding.accentColor}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminSupportEmail")}
              <input
                name="supportEmail"
                type="email"
                defaultValue={data.workspace.branding.supportEmail ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminCustomDomain")}
              <input
                name="customDomain"
                defaultValue={data.workspace.branding.customDomain ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminEmailSender")}
              <input
                name="emailFromName"
                defaultValue={data.workspace.branding.emailFromName ?? ""}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("adminResellerParent")}
              <input
                name="resellerParentId"
                defaultValue={data.workspace.resellerParentId ?? ""}
                className={`${input} mt-1`}
              />
            </label>
          </div>
          <label className="mt-3 block text-xs text-ink-soft">
            {g("adminEmailFooter")}
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
              {g("adminWhiteLabel")}
            </label>
            <label className="text-xs">
              <input
                type="checkbox"
                name="consultantMode"
                defaultChecked={data.workspace.consultantMode}
                className="mr-2 accent-signal"
              />
              {g("adminConsultantMode")}
            </label>
          </div>
          <button className="mt-5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">
            {g("adminSaveWorkspace")}
          </button>
        </form>
        <div className="panel p-5">
          <h2 className="text-lg font-medium">{g("adminGroupsHeading")}</h2>
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
              aria-label={g("adminGroupName")}
              name="name"
              required
              placeholder={g("adminGroupName")}
              className={input}
            />
            <input
              aria-label={g("adminGroupColor")}
              name="color"
              type="color"
              defaultValue="#5b8cff"
              className="w-28 rounded-lg border border-line bg-base-950 px-2"
            />
            <button className="rounded-lg border border-signal/30 px-4 text-xs text-signal">
              {g("adminAdd")}
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
                  {g("adminGroupClientCount", {
                    count: data.clients.filter((client) => client.groupId === group.id).length,
                  })}
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
              {g("adminClientsHeading")}
            </h2>
            <p className="mt-1 text-xs text-ink-faint">
              {g("adminClientsSubtitle")}
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
                  ?.name ?? g("ungrouped")}{" "}
                · {client.serviceTier}
              </div>
              <div className="mt-4 flex justify-between text-[11px] text-ink-soft">
                <span>{g("adminClientPortal", { mode: client.portalMode })}</span>
                <span>{g("adminClientSla", { minutes: client.slaResponseMinutes })}</span>
                <span>{client.billingMode}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-lg font-medium">{g("adminSeatsHeading")}</h2>
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
              aria-label={g("adminSeatEmail")}
              name="email"
              type="email"
              required
              placeholder={g("adminSeatEmailPlaceholder")}
              className={input}
            />
            <select aria-label={g("adminSeatRole")} name="role" className={input}>
              <option value="analyst">{g("roleAnalyst")}</option>
              <option value="manager">{g("roleManager")}</option>
              <option value="admin">{g("roleAdmin")}</option>
              <option value="billing">{g("roleBilling")}</option>
              <option value="viewer">{g("roleViewer")}</option>
            </select>
            <button className="rounded-lg bg-signal px-4 text-xs font-semibold text-base-950">
              {g("adminInvite")}
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
                    {member.role} · {member.active ? g("adminMemberActive") : g("adminMemberInactive")}
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
                    {member.active ? g("adminDeactivate") : g("adminActivate")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-ink-faint">
            {g("adminPendingInvitationCount", {
              count: data.invites.filter((invite) => !invite.acceptedAt).length,
            })}
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-medium">{g("adminApiHeading")}</h2>
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
              aria-label={g("adminApiKeyName")}
              name="name"
              required
              placeholder={g("adminApiKeyPlaceholder")}
              className={input}
            />
            <button className="rounded-lg border border-signal/30 px-4 text-xs text-signal">
              {g("adminCreateKey")}
            </button>
          </form>
          {secret && (
            <div className="mt-3 rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3">
              <div className="text-[11px] text-risk-medium">
                {g("adminCopyNow")}
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
                  {g("adminRevoke")}
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
        <h2 className="text-lg font-medium">{g("adminReportCenter")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.reports.map((report) => {
            const suffix = `${report.kind[0]!.toUpperCase()}${report.kind.slice(1)}` as "Client" | "Portfolio" | "Executive";
            const client = typeof report.content.client === "string" ? report.content.client : data.workspace.name;
            return (
            <div key={report.id} className="rounded-xl border border-line p-4">
              <div className="text-sm">{g(`reportTitle${suffix}`, { client })}</div>
              <div className="mono mt-1 text-[11px] uppercase text-ink-faint">
                {g(`reportKind${suffix}`)} · {tr.formatDate(report.createdAt)}
              </div>
              <Link
                href={`/api/agency/reports/${report.id}?agencyId=${agencyId}`}
                className="mt-4 inline-block text-xs text-signal"
              >
                {g("adminDownloadPdf")}
              </Link>
              <ReportDelivery agencyId={agencyId} reportId={report.id} />
            </div>
          );})}
          {!data.reports.length && (
            <p className="text-sm text-ink-faint">
              {g("adminNoReports")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
