"use client";
import { useState } from "react";
import type {
  EnterpriseOverview,
  EnterpriseRecord,
} from "@/lib/enterprise/types";
import { useTranslator } from "@/lib/i18n/context";
type Tab = "overview" | "identity" | "governance" | "integrations" | "data";
const tabs = [
  { id: "overview", key: "tabOverview" },
  { id: "identity", key: "tabIdentity" },
  { id: "governance", key: "tabGovernance" },
  { id: "integrations", key: "tabIntegrations" },
  { id: "data", key: "tabData" },
] as const satisfies ReadonlyArray<{ id: Tab; key: string }>;
const countLabels = [
  ["directoryUsers", "countDirectoryUsers"], ["roles", "countRoles"], ["units", "countUnits"],
  ["ownership", "countOwnership"], ["integrations", "countIntegrations"], ["audit", "countAudit"],
] as const satisfies ReadonlyArray<readonly [keyof EnterpriseOverview["counts"], string]>;
const LICENSE_KEY = { trial: "licenseTrial", active: "licenseActive", suspended: "licenseSuspended", expired: "licenseExpired" } as const;
const INTEGRATION_STATUS_KEY = { healthy: "statusHealthy", degraded: "statusDegraded", disabled: "statusDisabled" } as const;
const INTEGRATION_CATEGORY_KEY = { siem: "categorySiem", soar: "categorySoar", ticketing: "categoryTicketing", webhook: "categoryWebhook", export: "categoryExport" } as const;
function Metric({
  value,
  label,
  tone = "signal",
}: {
  value: string | number;
  label: string;
  tone?: "signal" | "warn";
}) {
  return (
    <div className="rounded-xl border border-line bg-base-900/55 p-4">
      <div
        className={`text-2xl font-semibold ${tone === "signal" ? "text-signal" : "text-risk-medium"}`}
      >
        {value}
      </div>
      <div className="mono mt-1 text-[11px] uppercase tracking-[.15em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}
function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5 md:p-6">
      <div className="mono text-[11px] uppercase tracking-[.18em] text-signal">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-xl font-medium text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function EnterpriseConsole({
  initial,
  organizationName,
}: {
  initial: EnterpriseOverview;
  organizationName: string;
}) {
  const tr = useTranslator();
  const [overview, setOverview] = useState(initial),
    [tab, setTab] = useState<Tab>("overview"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [messageIsSecret, setMessageIsSecret] = useState(false);
  const org = `orgId=${encodeURIComponent(overview.workspace.orgId)}`;
  async function refresh() {
    const response = await fetch(`/api/enterprise?${org}`, {
      cache: "no-store",
    });
    if (response.ok) setOverview(await response.json());
  }
  async function create(url: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setMessageIsSecret(false);
    const response = await fetch(
        `${url}${url.includes("?") ? "&" : "?"}${org}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
      data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(tr.t("enterprise", "operationFailed"));
      return null;
    }
    const secret = data.token ?? data.scimToken;
    setMessageIsSecret(!!secret);
    setMessage(secret ? tr.t("enterprise", "copySecret", { secret }) : tr.t("enterprise", "savedAudit"));
    await refresh();
    return data;
  }
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-signal/20 bg-[radial-gradient(circle_at_12%_0%,rgba(56,225,195,.13),transparent_34%),linear-gradient(135deg,rgba(12,25,22,.96),rgba(7,12,16,.98))] p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 grid-backdrop opacity-30" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mono text-[11px] uppercase tracking-[.22em] text-signal">
              {tr.t("enterprise", "kicker")}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-gradient md:text-4xl">
              {tr.t("enterprise", "controlPlaneTitle", { organization: organizationName })}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
              {tr.t("enterprise", "intro")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right">
            <div className="rounded-lg border border-line bg-base-950/50 px-3 py-2">
              <div className="mono text-[11px] uppercase text-ink-faint">
                {tr.t("enterprise", "license")}
              </div>
              <div className="mt-1 text-sm capitalize text-signal">
                {tr.t("enterprise", LICENSE_KEY[overview.workspace.licenseStatus])}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-base-950/50 px-3 py-2">
              <div className="mono text-[11px] uppercase text-ink-faint">
                {tr.t("enterprise", "residency")}
              </div>
              <div className="mt-1 text-sm uppercase text-ink">
                {overview.workspace.dataRegion}
              </div>
            </div>
          </div>
        </div>
      </section>
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-base-900/70 p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs transition ${tab === item.id ? "bg-signal/10 text-signal shadow-[inset_0_0_0_1px_rgba(56,225,195,.18)]" : "text-ink-faint hover:bg-base-700 hover:text-ink"}`}
          >
            {tr.t("enterprise", item.key as Parameters<typeof tr.t<"enterprise">>[1])}
          </button>
        ))}
      </nav>
      {message && (
        <div
          className={`mono break-all rounded-lg border px-4 py-3 text-xs ${messageIsSecret ? "border-risk-medium/30 bg-risk-medium/5 text-risk-medium" : "border-signal/20 bg-signal/5 text-signal"}`}
        >
          {message}
        </div>
      )}
      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Section eyebrow={tr.t("enterprise", "portfolioState")} title={tr.t("enterprise", "enterprisePosture")}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {countLabels.map(([key, label]) => (
                <Metric key={key} value={overview.counts[key]} label={tr.t("enterprise", label as Parameters<typeof tr.t<"enterprise">>[1])} />
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">{tr.t("enterprise", "auditChainHead")}</span>
                <span className="mono text-[11px] text-signal">
                  {overview.auditHead
                    ? `#${overview.auditHead.sequence}`
                    : tr.t("enterprise", "genesis")}
                </span>
              </div>
              <div className="mono mt-2 truncate text-[11px] text-ink-faint">
                {overview.auditHead?.hash ??
                  tr.t("enterprise", "noMutations")}
              </div>
            </div>
          </Section>
          <Section eyebrow={tr.t("enterprise", "attention")} title={tr.t("enterprise", "governanceQueue")}>
            <div className="space-y-3">
              <Metric
                value={overview.pendingApprovals.length}
                label={tr.t("enterprise", "pendingApprovals")}
                tone={overview.pendingApprovals.length ? "warn" : "signal"}
              />
              <Metric
                value={overview.expiringExceptions.length}
                label={tr.t("enterprise", "activeExceptions")}
                tone={overview.expiringExceptions.length ? "warn" : "signal"}
              />
              <Metric
                value={
                  overview.integrations.filter(
                    (item) => item.status === "degraded",
                  ).length
                }
                label={tr.t("enterprise", "degradedIntegrations")}
                tone={
                  overview.integrations.some(
                    (item) => item.status === "degraded",
                  )
                    ? "warn"
                    : "signal"
                }
              />
            </div>
          </Section>
        </div>
      )}
      {tab === "identity" && (
        <IdentityPanel overview={overview} busy={busy} create={create} />
      )}{" "}
      {tab === "governance" && (
        <GovernancePanel overview={overview} busy={busy} create={create} />
      )}{" "}
      {tab === "integrations" && (
        <IntegrationPanel overview={overview} busy={busy} create={create} />
      )}{" "}
      {tab === "data" && (
        <DataPanel overview={overview} busy={busy} create={create} />
      )}
    </div>
  );
}

function IdentityPanel({
  overview,
  busy,
  create,
}: {
  overview: EnterpriseOverview;
  busy: boolean;
  create: (url: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const tr = useTranslator();
  const [form, set] = useState({
    name: tr.t("enterprise", "providerName"),
    protocol: "oidc",
    domain: "",
    issuer: "",
    authorizationEndpoint: "",
    tokenEndpoint: "",
    jwksUri: "",
    clientId: "",
    clientSecret: "",
  });
  const field = (key: keyof typeof form, label: string, secret = false) => (
    <input
      type={secret ? "password" : "text"}
      aria-label={label}
      placeholder={label}
      value={form[key]}
      onChange={(event) => set({ ...form, [key]: event.target.value })}
      className="rounded-lg border border-line bg-base-950 px-3 py-2 text-xs outline-hidden focus:border-signal/40"
    />
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Section eyebrow={tr.t("enterprise", "federation")} title={tr.t("enterprise", "identityProviders")}>
        {overview.identityProviders.length ? (
          <div className="space-y-2">
            {overview.identityProviders.map((item) => (
              <div key={item.id} className="rounded-lg border border-line p-3">
                <div className="flex justify-between">
                  <span className="text-sm text-ink">{item.name}</span>
                  <span
                    className={`mono text-[11px] uppercase ${item.enabled ? "text-signal" : "text-ink-faint"}`}
                  >
                    {tr.t("enterprise", "identityState", { protocol: item.protocol, state: tr.t("enterprise", item.enabled ? "stateEnforced" : "stateStaged") })}
                  </span>
                </div>
                <div className="mono mt-2 text-[11px] text-ink-faint">
                  {item.domains.join(", ")} · {tr.t("enterprise", "scimState", { state: tr.t("enterprise", item.scimTokenPrefix ? "stateConfigured" : "stateNotIssued") })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            {tr.t("enterprise", "noSso")}
          </Empty>
        )}
      </Section>
      <Section eyebrow={tr.t("enterprise", "samlOidc")} title={tr.t("enterprise", "addIdentity")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            aria-label={tr.t("enterprise", "protocolLabel")}
            value={form.protocol}
            onChange={(event) => set({ ...form, protocol: event.target.value })}
            className="rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
          >
            <option value="oidc">OIDC</option>
            <option value="saml">{tr.t("enterprise", "samlBroker")}</option>
          </select>
          {field("name", tr.t("enterprise", "providerName"))}
          {field("domain", tr.t("enterprise", "loginDomain"))}
          {field("issuer", tr.t("enterprise", "issuerUrl"))}
          {field("authorizationEndpoint", tr.t("enterprise", "authorizationEndpoint"))}
          {field("tokenEndpoint", tr.t("enterprise", "tokenEndpoint"))}
          {field("jwksUri", tr.t("enterprise", "jwksUri"))}
          {field("clientId", tr.t("enterprise", "clientId"))}
          {field("clientSecret", tr.t("enterprise", "clientSecret"), true)}
        </div>
        <p className="mt-3 text-[12px] leading-5 text-ink-faint">
          {tr.t("enterprise", "samlBoundary")}
        </p>
        <button
          disabled={busy}
          onClick={() =>
            create("/api/enterprise/identity", {
              protocol: form.protocol,
              name: form.name,
              domains: [form.domain],
              enabled: true,
              enforceSso: false,
              jitProvisioning: true,
              issueScimToken: true,
              config: {
                issuer: form.issuer,
                authorizationEndpoint: form.authorizationEndpoint,
                tokenEndpoint: form.tokenEndpoint,
                jwksUri: form.jwksUri,
                clientId: form.clientId,
                clientSecret: form.clientSecret,
                ...(form.protocol === "saml" ? { brokered: true } : {}),
              },
            })
          }
          className="mt-4 rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50"
        >
          {tr.t("enterprise", "stageIdentity")}
        </button>
      </Section>
    </div>
  );
}

function GovernancePanel({
  overview,
  busy,
  create,
}: {
  overview: EnterpriseOverview;
  busy: boolean;
  create: (url: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const tr = useTranslator();
  const [name, setName] = useState(tr.t("enterprise", "createScoringPolicy")),
    [document, setDocument] = useState(() => JSON.stringify({ rules: [{ name: tr.t("enterprise", "policyRuleCriticalAuth"), severity: "critical", delta: 15 }] }, null, 2));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section eyebrow={tr.t("enterprise", "decisionControl")} title={tr.t("enterprise", "approvalsExceptions")}>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            value={overview.pendingApprovals.length}
            label={tr.t("enterprise", "awaitingDecision")}
            tone={overview.pendingApprovals.length ? "warn" : "signal"}
          />
          <Metric
            value={overview.expiringExceptions.length}
            label={tr.t("enterprise", "timeBoundExceptions")}
            tone={overview.expiringExceptions.length ? "warn" : "signal"}
          />
        </div>
        <div className="mt-4 space-y-2">
          {overview.pendingApprovals.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-lg border border-line p-3">
              <div className="text-sm">{tr.t("enterprise", "approvalRequest")}</div>
              <div className="mono mt-1 text-[11px] text-ink-faint">
                {tr.t("enterprise", "requestedBy", { subjectId: item.subjectId, user: item.requestedBy })}
              </div>
            </div>
          ))}
          {!overview.pendingApprovals.length && (
            <Empty>{tr.t("enterprise", "noGovernance")}</Empty>
          )}
        </div>
      </Section>
      <Section eyebrow={tr.t("enterprise", "policyAsData")} title={tr.t("enterprise", "createScoringPolicy")}>
        <input
          aria-label={tr.t("enterprise", "policyName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
        />
        <textarea
          aria-label={tr.t("enterprise", "policyDocument")}
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          rows={8}
          className="mono mt-2 w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-[12px] leading-5"
        />
        <button
          disabled={busy}
          onClick={() => {
            try {
              void create("/api/enterprise/resources/policies", {
                kind: "scoring",
                name,
                document: JSON.parse(document),
              });
            } catch {
              /* server remains authoritative */
            }
          }}
          className="mt-3 rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50"
        >
          {tr.t("enterprise", "versionPolicy")}
        </button>
      </Section>
    </div>
  );
}

function IntegrationPanel({
  overview,
  busy,
  create,
}: {
  overview: EnterpriseOverview;
  busy: boolean;
  create: (url: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const tr = useTranslator();
  const [provider, setProvider] = useState("splunk"),
    [url, setUrl] = useState(""),
    [credential, setCredential] = useState("");
  const config =
    provider === "webhook"
      ? { url, signingSecret: credential }
      : provider === "splunk"
        ? { url, hecToken: credential }
        : provider === "elastic"
          ? { url, apiKey: credential }
          : provider === "pagerduty"
            ? { url, routingKey: credential }
            : provider === "opsgenie"
              ? { url, apiKey: credential }
              : { url, token: credential };
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <Section eyebrow="SIEM · SOAR · ITSM" title={tr.t("enterprise", "operationalConnections")}>
        {overview.integrations.length ? (
          <div className="space-y-2">
            {overview.integrations.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-line p-3"
              >
                <div>
                  <div className="text-sm text-ink">{item.name}</div>
                  <div className="mono mt-1 text-[11px] uppercase text-ink-faint">
                    {tr.t("enterprise", "integrationState", { category: tr.t("enterprise", INTEGRATION_CATEGORY_KEY[item.category]), provider: item.provider })}
                  </div>
                </div>
                <div
                  className={`mono text-[11px] uppercase ${item.status === "healthy" ? "text-signal" : item.status === "degraded" ? "text-risk-high" : "text-ink-faint"}`}
                >
                  {tr.t("enterprise", INTEGRATION_STATUS_KEY[item.status as keyof typeof INTEGRATION_STATUS_KEY] ?? "statusUnknown")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{tr.t("enterprise", "noDestination")}</Empty>
        )}
      </Section>
      <Section eyebrow={tr.t("enterprise", "providerAdapter")} title={tr.t("enterprise", "connectDestination")}>
        <select
          aria-label={tr.t("enterprise", "integrationProvider")}
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
        >
          <option value="splunk">Splunk HEC</option>
          <option value="elastic">Elastic Security</option>
          <option value="qradar">IBM QRadar</option>
          <option value="chronicle">Google Chronicle</option>
          <option value="cortex_xsoar">Cortex XSOAR</option>
          <option value="pagerduty">PagerDuty</option>
          <option value="opsgenie">Opsgenie</option>
          <option value="webhook">{tr.t("enterprise", "signedWebhook")}</option>
        </select>
        <input
          aria-label={tr.t("enterprise", "integrationUrl")}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={tr.t("enterprise", "integrationUrlPlaceholder")}
          className="mt-2 w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
        />
        <input
          aria-label={tr.t("enterprise", "providerCredential")}
          type="password"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          placeholder={tr.t("enterprise", "providerCredential")}
          className="mt-2 w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
        />
        <button
          disabled={busy}
          onClick={() =>
            create("/api/enterprise/integrations", {
              provider,
              name: provider.replaceAll("_", " "),
              config,
            })
          }
          className="mt-3 rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50"
        >
          {tr.t("enterprise", "connectSecurely")}
        </button>
      </Section>
    </div>
  );
}

function DataPanel({
  overview,
  busy,
  create,
}: {
  overview: EnterpriseOverview;
  busy: boolean;
  create: (url: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const tr = useTranslator();
  const [tokenName, setTokenName] = useState(tr.t("enterprise", "tokenNameDefault"));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section eyebrow={tr.t("enterprise", "evidenceExports")} title={tr.t("enterprise", "enterpriseReporting")}>
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={`/api/enterprise/reports?orgId=${overview.workspace.orgId}&kind=executive&format=pdf`}
            className="rounded-lg border border-line p-4 text-sm text-ink transition hover:border-signal/30 hover:bg-signal/5"
          >
            {tr.t("enterprise", "executivePdf")}
            <div className="mono mt-1 text-[11px] text-ink-faint">
              {tr.t("enterprise", "leadershipPosture")}
            </div>
          </a>
          <a
            href={`/api/enterprise/reports?orgId=${overview.workspace.orgId}&kind=compliance&format=csv`}
            className="rounded-lg border border-line p-4 text-sm text-ink transition hover:border-signal/30 hover:bg-signal/5"
          >
            {tr.t("enterprise", "complianceCsv")}
            <div className="mono mt-1 text-[11px] text-ink-faint">
              SOC 2 · ISO · NIS2 · DORA
            </div>
          </a>
          <a
            href={`/api/enterprise/audit?orgId=${overview.workspace.orgId}&format=ndjson`}
            className="rounded-lg border border-line p-4 text-sm text-ink transition hover:border-signal/30 hover:bg-signal/5"
          >
            {tr.t("enterprise", "auditNdjson")}
            <div className="mono mt-1 text-[11px] text-ink-faint">
              {tr.t("enterprise", "verifiedHashExport")}
            </div>
          </a>
          <a
            href={`/api/enterprise/graphql`}
            className="rounded-lg border border-line p-4 text-sm text-ink transition hover:border-signal/30 hover:bg-signal/5"
          >
            {tr.t("enterprise", "graphqlSchema")}
            <div className="mono mt-1 text-[11px] text-ink-faint">
              {tr.t("enterprise", "persistedOperations")}
            </div>
          </a>
        </div>
      </Section>
      <Section eyebrow={tr.t("enterprise", "machineAccess")} title={tr.t("enterprise", "scopedApiToken")}>
        <input
          aria-label={tr.t("enterprise", "apiTokenName")}
          value={tokenName}
          onChange={(event) => setTokenName(event.target.value)}
          className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-xs"
        />
        <p className="mt-3 text-[12px] leading-5 text-ink-faint">
          {tr.t("enterprise", "tokenOnce")}
        </p>
        <button
          disabled={busy}
          onClick={() =>
            create("/api/enterprise/tokens", {
              name: tokenName,
              permissions: [
                "enterprise:read",
                "assets:read",
                "findings:read",
                "audit:read",
              ],
            })
          }
          className="mt-3 rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50"
        >
          {tr.t("enterprise", "issueReadonlyToken")}
        </button>
        <div className="mt-5 border-t border-line pt-4">
          <div className="mono text-[11px] uppercase text-ink-faint">
            {tr.t("enterprise", "retentionControls")}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric
              value={overview.workspace.retention.integrationDays ?? 90}
              label={tr.t("enterprise", "deliveryDays")}
            />
            <Metric
              value={overview.workspace.retention.ticketDays ?? 730}
              label={tr.t("enterprise", "ticketDays")}
            />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-ink-faint">
            {tr.t("enterprise", "retentionBody")}
          </p>
        </div>
      </Section>
    </div>
  );
}
