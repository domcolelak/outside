import { CONNECTORS } from "@/lib/aegis/integrations";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { CloudflareConnector } from "@/components/integrations/CloudflareConnector";
import { ProviderConnector } from "@/components/integrations/ProviderConnector";
import { listByokDescriptors } from "@/lib/integrations/providers/registry";

export const dynamic = "force-dynamic";

const BYOK_CATEGORY_LABEL: Record<string, string> = {
  threat_intel: "Breach intelligence",
  attack_surface: "Attack-surface intelligence",
  reputation: "IP reputation and classification",
  ai: "AI and enrichment",
  notifier: "Notifications",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const ctx = await getSessionContext();
  const requestedOrgId = (await searchParams).orgId;
  const adminMemberships =
    ctx?.memberships.filter((membership) =>
      roleAtLeast(membership.role, "admin"),
    ) ?? [];
  const requestedMembership = requestedOrgId
    ? adminMemberships.find(
        (membership) => membership.org.id === requestedOrgId,
      )
    : null;
  const selectedMembership = requestedMembership ?? adminMemberships[0] ?? null;
  const selectedOrg = selectedMembership?.org ?? null;
  const canConnect = !!ctx?.user.emailVerifiedAt && !!selectedOrg;
  const connectRequirement = !ctx
    ? "Sign in to connect."
    : !ctx.user.emailVerifiedAt
      ? "Verify your email to connect."
      : "Owner or admin access is required to connect.";

  const byok = listByokDescriptors();
  const byokGroups = byok.reduce<Record<string, typeof byok>>(
    (groups, descriptor) => {
      (groups[descriptor.category] ??= []).push(descriptor);
      return groups;
    },
    {},
  );
  const cloudflare = CONNECTORS.find(
    (connector) => connector.id === "cloudflare",
  );
  const comingSoon = CONNECTORS.filter(
    (connector) => connector.id !== "cloudflare",
  );

  return (
    <>
      <div className="mono text-[12px] uppercase tracking-widest text-signal">
        Integrations
      </div>
      <h1 className="mt-2 text-3xl font-semibold text-ink">
        Connect intelligence and remediation
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
        Add your own provider keys to enrich scans of verified targets with
        breach, passive-DNS, and IP-reputation data. These intelligence
        connections are read-only. Cloudflare is separate: its scoped token can
        create or roll back an approved DMARC monitor-mode policy after you
        preview it.
      </p>

      <section
        aria-labelledby="integration-workspace-heading"
        className="panel mt-6 p-4 sm:p-5"
      >
        <h2
          id="integration-workspace-heading"
          className="text-base font-medium text-ink"
        >
          Organization
        </h2>
        {adminMemberships.length > 0 ? (
          <>
            <form
              action="/integrations"
              method="get"
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <label className="block min-w-0 flex-1" htmlFor="integration-org">
                <span className="mono mb-1.5 block text-[12px] uppercase tracking-wide text-ink-faint">
                  Manage connections for
                </span>
                <select
                  id="integration-org"
                  name="orgId"
                  defaultValue={selectedOrg?.id}
                  className="min-h-11 w-full rounded-lg border border-line bg-base-900 px-3 text-sm text-ink focus-visible:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  {adminMemberships.map((membership) => (
                    <option key={membership.org.id} value={membership.org.id}>
                      {membership.org.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-lg border border-line bg-base-850 px-4 text-sm text-ink-soft transition hover:border-signal/30 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                Open organization
              </button>
            </form>
            {selectedOrg && (
              <p className="mt-3 text-sm text-ink-soft">
                Connections and provider usage below belong to{" "}
                <strong className="font-medium text-ink">
                  {selectedOrg.name}
                </strong>
                .
              </p>
            )}
            {requestedOrgId && !requestedMembership && selectedOrg && (
              <p role="alert" className="mt-3 text-sm text-risk-medium">
                The requested organization is not available to manage. Showing{" "}
                <strong className="font-medium">{selectedOrg.name}</strong>{" "}
                instead.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {ctx
              ? "Owner or admin access to an organization is required to manage connections."
              : "Sign in as an organization owner or admin to manage connections."}
          </p>
        )}
      </section>

      {ctx && !ctx.user.emailVerifiedAt && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-risk-medium/30 bg-risk-medium/5 px-4 py-3 text-sm text-risk-medium"
        >
          Verify your email address before connecting or replacing a provider
          credential.
        </div>
      )}

      <div className="mt-10 space-y-12">
        <section aria-labelledby="data-sources-heading">
          <h2
            id="data-sources-heading"
            className="text-xl font-semibold text-ink"
          >
            Read-only data sources
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
            OUTSIDE sends only the verified domain or its resolved public IPs
            needed for the selected lookup. Provider keys stay server-side,
            encrypted at rest, and are never shown again after saving.
          </p>

          <div className="mt-6 space-y-8">
            {Object.entries(byokGroups).map(([category, list]) => (
              <section
                key={category}
                aria-labelledby={`provider-category-${category}`}
              >
                <h3
                  id={`provider-category-${category}`}
                  className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint"
                >
                  {BYOK_CATEGORY_LABEL[category] ?? category}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((descriptor) =>
                    canConnect && selectedOrg ? (
                      <ProviderConnector
                        key={`${selectedOrg.id}:${descriptor.id}`}
                        descriptor={descriptor}
                        orgId={selectedOrg.id}
                      />
                    ) : (
                      <article key={descriptor.id} className="panel p-4">
                        <h4 className="text-ink">{descriptor.name}</h4>
                        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                          {descriptor.summary}
                        </p>
                        <div className="mono mt-3 text-[12px] text-ink-faint">
                          {connectRequirement}
                        </div>
                      </article>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>

        {cloudflare && (
          <section aria-labelledby="remediation-heading">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                id="remediation-heading"
                className="text-xl font-semibold text-ink"
              >
                Remediation access
              </h2>
              <span className="mono rounded-md border border-risk-medium/40 bg-risk-medium/10 px-2.5 py-1 text-[12px] uppercase tracking-wide text-risk-medium">
                Write-capable
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
              Unlike the read-only sources above, Cloudflare is a live
              write-capable connection. Its current scope is one guided
              workflow: preview, create, and roll back a DMARC monitor-mode TXT
              record for a verified organization domain.
            </p>
            <article className="panel mt-4 p-4 sm:p-5">
              <h3 className="text-lg font-medium text-ink">
                {cloudflare.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Connect a token limited to Zone:Read and DNS:Edit. OUTSIDE shows
                the exact DMARC record before applying it and does not manage
                WAF, access policies, security headers, or other DNS records
                yet.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="mono rounded-sm border border-line px-2 py-1 text-[11px] text-ink-faint">
                  DMARC monitor-mode TXT
                </span>
              </div>
              {canConnect && selectedOrg ? (
                <CloudflareConnector
                  key={selectedOrg.id}
                  orgId={selectedOrg.id}
                  orgName={selectedOrg.name}
                />
              ) : (
                <div className="mono mt-4 text-[12px] text-ink-faint">
                  {connectRequirement}
                </div>
              )}
            </article>
          </section>
        )}

        <section aria-labelledby="coming-soon-heading">
          <h2
            id="coming-soon-heading"
            className="text-xl font-semibold text-ink"
          >
            Coming soon
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
            These connectors are planned, but cannot yet be connected from a
            customer workspace.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {comingSoon.map((connector) => (
              <li
                key={connector.id}
                title={connector.summary}
                className="rounded-lg border border-line bg-base-900 px-3 py-2 text-sm text-ink-soft"
              >
                {connector.name}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
