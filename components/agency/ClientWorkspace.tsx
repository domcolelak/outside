"use client";

import { useTranslator } from "@/lib/i18n/context";
import { useCallback, useEffect, useState } from "react";
import type {
  AgencyClientView,
  AgencyFindingShare,
  AgencyGroup,
  AgencyNote,
  AgencyRole,
  AgencySlaEvent,
  AgencyWorkspace,
} from "@/lib/agency/types";
import { hasAgencyPermission } from "@/lib/agency/types";
import type { GuardianOverview } from "@/lib/guardian/types";

type Detail = {
  workspace: AgencyWorkspace;
  client: AgencyClientView;
  guardian: GuardianOverview;
  notes: AgencyNote[];
  shares: AgencyFindingShare[];
  sla: AgencySlaEvent[];
  role: AgencyRole;
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
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
  return (
    <section className="panel p-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono text-[11px] uppercase text-ink-faint">
            {g("slaKicker")}
          </div>
          <h2 className="mt-1 text-lg font-medium">{g("slaHeading")}</h2>
        </div>
        <span className="text-xs text-risk-high">
          {g("slaBreachedCount", { count: open.filter((item) => item.breached).length })}
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
              <div className="mono mt-1 text-[11px] uppercase text-ink-faint">
                {g("slaItemMeta", {
                  priority: item.priority,
                  date: tr.formatDate(item.dueAt, { dateStyle: "medium", timeStyle: "short" }),
                  status: item.status,
                })}
              </div>
            </div>
            <div className="flex gap-2">
              {item.status === "open" && (
                <button
                  onClick={() => onAction(item.id, "acknowledge")}
                  className="rounded-sm border border-line px-3 py-1 text-[11px]"
                >
                  {g("slaAcknowledge")}
                </button>
              )}
              <button
                onClick={() => onAction(item.id, "resolve")}
                className="rounded-sm border border-signal/30 px-3 py-1 text-[11px] text-signal"
              >
                {g("slaResolve")}
              </button>
            </div>
          </div>
        ))}
        {!open.length && (
          <p className="text-sm text-ink-faint">{g("slaEmpty")}</p>
        )}
      </div>
    </section>
  );
}
const SEVERITY_KEY = {
  critical: "severityCritical",
  high: "severityHigh",
  medium: "severityMedium",
} as const;

export function ClientWorkspace({
  agencyId,
  clientId,
}: {
  agencyId: string;
  clientId: string;
}) {
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
  const [data, setData] = useState<Detail | null>(null);
  const [groups, setGroups] = useState<AgencyGroup[]>([]);
  // Outcome and wording travel together: the banner used to pick its colour by
  // comparing the message to the literal "Saved", which stops working the
  // moment that word is translated.
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
    // A timeout, not requestAnimationFrame: rAF never fires in a background tab,
    // which would leave this workspace loading forever.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function post(
    url: string,
    body: Record<string, unknown>,
    method = "POST",
  ) {
    setMessage(null);
    const response = await fetch(`${url}?agencyId=${agencyId}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setMessage({ ok: response.ok, text: response.ok ? g("saved") : (result.error ?? g("operationFailed")) });
    if (response.ok) await load();
    return response.ok;
  }
  if (!data)
    return (
      <div className="panel p-8 text-ink-soft">{g("workspaceLoading")}</div>
    );
  const canManageClients = hasAgencyPermission(data.role, "clients:manage");
  const canManageBilling = hasAgencyPermission(data.role, "billing:manage");
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
            <div className="mono text-[11px] uppercase tracking-[.2em] text-signal">
              {data.workspace.consultantMode
                ? g("consultantEngagement")
                : g("managedServiceClient")}
            </div>
            <h1 className="mt-2 text-4xl font-semibold text-gradient">
              {data.client.organizationName}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">
              {g("clientSummary", {
                targets: data.guardian.targets.length,
                tier: data.client.serviceTier,
                minutes: data.client.slaResponseMinutes,
              })}
            </p>
          </div>
          <div className="mono text-[11px] text-ink-faint">
            {g("portalModeLabel", { mode: data.client.portalMode })}
            {canManageBilling && data.client.billingMode
              ? g("billingModeLabel", { mode: data.client.billingMode })
              : ""}
          </div>
        </div>
      </section>
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-signal/20 text-signal" : "border-risk-high/30 text-risk-high"}`}
        >
          {message.text}
        </div>
      )}
      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <form
          className="panel p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (canManageClients) {
              await post(
                "/api/agency/clients",
                {
                  clientId,
                  status: form.get("status"),
                  portalMode: form.get("portalMode"),
                  groupId: form.get("groupId"),
                  serviceTier: form.get("serviceTier"),
                  slaResponseMinutes: form.get("sla"),
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
            }
            if (canManageBilling) {
              await post(
                "/api/agency/billing",
                {
                  clientId,
                  billingMode: form.get("billingMode"),
                  monthlyPriceCents: data.workspace.consultantMode
                    ? (data.client.monthlyPriceCents ?? 0)
                    : Math.round(Number(form.get("price")) * 100),
                  currency: data.workspace.consultantMode
                    ? data.client.currency
                    : form.get("currency"),
                },
                "PATCH",
              );
            }
          }}
        >
          <h2 className="text-lg font-medium">{g("clientConfiguration")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              {g("fieldStatus")}
              <select
                name="status"
                defaultValue={data.client.status}
                disabled={!canManageClients}
                className={`${input} mt-1`}
              >
                <option value="onboarding">{g("statusOnboarding")}</option>
                <option value="active">{g("statusActive")}</option>
                <option value="paused">{g("statusPaused")}</option>
                <option value="offboarded">{g("statusOffboarded")}</option>
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              {g("fieldPortal")}
              <select
                name="portalMode"
                defaultValue={data.client.portalMode}
                disabled={!canManageClients}
                className={`${input} mt-1`}
              >
                <option value="disabled">{g("portalDisabled")}</option>
                <option value="readonly">{g("portalReadonly")}</option>
                <option value="collaborative">{g("portalCollaborative")}</option>
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              {g("fieldGroup")}
              <select
                name="groupId"
                defaultValue={data.client.groupId ?? ""}
                disabled={!canManageClients}
                className={`${input} mt-1`}
              >
                <option value="">{g("ungrouped")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-soft">
              {g("fieldServiceTier")}
              <input
                name="serviceTier"
                defaultValue={data.client.serviceTier}
                disabled={!canManageClients}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              {g("fieldSlaMinutes")}
              <input
                name="sla"
                type="number"
                min="15"
                defaultValue={data.client.slaResponseMinutes}
                disabled={!canManageClients}
                className={`${input} mt-1`}
              />
            </label>
            {canManageBilling && (
              <>
                <label className="text-xs text-ink-soft">
                  {g("fieldBillingMode")}
                  <select
                    name="billingMode"
                    defaultValue={data.client.billingMode}
                    className={`${input} mt-1`}
                  >
                    <option value="agency">{g("billingAgencyPaid")}</option>
                    <option value="direct">{g("billingClientDirect")}</option>
                    <option value="reseller">{g("billingReseller")}</option>
                  </select>
                </label>
                {!data.workspace.consultantMode && (
                  <>
                    <label className="text-xs text-ink-soft">
                      {g("fieldMonthlyPrice")}
                      <input
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={
                          (data.client.monthlyPriceCents ?? 0) / 100
                        }
                        className={`${input} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-ink-soft">
                      {g("fieldCurrency")}
                      <input
                        name="currency"
                        maxLength={3}
                        defaultValue={data.client.currency}
                        className={`${input} mt-1`}
                      />
                    </label>
                  </>
                )}
              </>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="mono text-[11px] uppercase text-ink-faint">
              {g("routingHeading")}
            </div>
            <label className="mt-3 block text-xs text-ink-soft">
              {g("fieldEmailRecipients")}
              <input
                name="emails"
                disabled={!canManageClients}
                defaultValue={(routing.emails ?? []).join(", ")}
                placeholder={g("emailsPlaceholder")}
                className={`${input} mt-1`}
              />
            </label>
            <label className="mt-3 block text-xs text-ink-soft">
              {g("fieldChannelIds")}
              <input
                name="channels"
                disabled={!canManageClients}
                defaultValue={(routing.channelIds ?? []).join(", ")}
                placeholder={g("channelsPlaceholder")}
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
                    disabled={!canManageClients}
                    defaultChecked={(
                      routing.severities ?? ["critical", "high"]
                    ).includes(severity)}
                    className="mr-1 accent-signal"
                  />
                  {g(SEVERITY_KEY[severity as keyof typeof SEVERITY_KEY])}
                </label>
              ))}
            </div>
          </div>
          {(canManageClients || canManageBilling) && (
            <button className="mt-5 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">
              {g("saveClient")}
            </button>
          )}
        </form>
        <div className="space-y-6">
          <div className="panel p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-medium">{g("portalNotes")}</h2>
                <p className="mt-1 text-xs text-ink-faint">
                  {g("notesSubtitle")}
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
                aria-label={g("noteLabel")}
                name="body"
                required
                maxLength={5000}
                className={`${input} min-h-24`}
                placeholder={g("notePlaceholder")}
              />
              <div className="mt-2 flex justify-between">
                <select
                  aria-label={g("noteVisibilityLabel")}
                  name="visibility"
                  className="rounded-sm border border-line bg-base-950 px-2 text-xs"
                >
                  <option value="internal">{g("noteInternal")}</option>
                  <option value="shared">{g("noteShared")}</option>
                </select>
                <button className="rounded-sm border border-signal/30 px-3 py-2 text-xs text-signal">
                  {g("addNote")}
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
                  <div className="mono mt-2 text-[11px] uppercase text-ink-faint">
                    {note.visibility === "shared" ? g("noteVisibilityShared") : g("noteVisibilityInternal")} ·{" "}
                    {tr.formatDate(note.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="text-lg font-medium">{g("portalReportingHeading")}</h2>
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
                {g("generateReport")}
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
                {g("generateDigest")}
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
                aria-label={g("inviteEmailLabel")}
                name="email"
                type="email"
                required
                placeholder={g("invitePlaceholder")}
                className={input}
              />
              <button className="rounded-lg border border-signal/30 px-3 text-xs text-signal">
                {g("inviteToPortal")}
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
            <div className="mono text-[11px] uppercase text-ink-faint">
              {g("sharedFindingsKicker")}
            </div>
            <h2 className="mt-1 text-lg font-medium">
              {g("guardianRecommendations")}
            </h2>
          </div>
          <span className="text-xs text-ink-faint">
            {g("sharedWithClientCount", { count: shared.size })}
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
                  <span className="mono text-[11px] uppercase text-risk-high">
                    {recommendation.priority}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  {recommendation.why}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-ink-faint">
                    {g("affectedConfidence", {
                      assets: recommendation.affectedAssets.length,
                      confidence: Math.round(recommendation.confidence * 100),
                    })}
                  </span>
                  {shared.has(recommendation.id) ? (
                    <span className="mono text-[11px] uppercase text-signal">
                      {g("statusShared")}
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
                      className="rounded-sm border border-signal/30 px-3 py-1.5 text-[11px] text-signal"
                    >
                      {g("shareWithClient")}
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
