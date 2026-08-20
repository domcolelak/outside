import { CONNECTORS } from "@/lib/aegis/integrations";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { CloudflareConnector } from "@/components/integrations/CloudflareConnector";
import { ProviderConnector } from "@/components/integrations/ProviderConnector";
import { listByokDescriptors } from "@/lib/integrations/providers/registry";
import { providerSummaryKey } from "@/lib/integrations/providers/text";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

const BYOK_CATEGORY_KEY: Record<string, MessageKey<"integrations">> = {
  threat_intel: "categoryThreatIntel",
  attack_surface: "categoryAttackSurface",
  reputation: "categoryReputation",
  ai: "categoryAi",
  notifier: "categoryNotifier",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const ctx = await getSessionContext();
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const i = (key: MessageKey<"integrations">, values?: Record<string, string | number>) => t.t("integrations", key, values);
  const summaryFor = (descriptor: { id: string; summary: string }) => {
    const key = providerSummaryKey(descriptor.id);
    return key ? i(key) : i("providerSummaryUnavailable");
  };
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
    ? i("connectSignIn")
    : !ctx.user.emailVerifiedAt
      ? i("connectVerify")
      : i("connectAdmin");

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
        {i("kicker")}
      </div>
      <h1 className="mt-2 text-3xl font-semibold text-ink">
        {i("title")}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
        {i("intro")}
      </p>

      <section
        aria-labelledby="integration-workspace-heading"
        className="panel mt-6 p-4 sm:p-5"
      >
        <h2
          id="integration-workspace-heading"
          className="text-base font-medium text-ink"
        >
          {i("organizationHeading")}
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
                  {i("manageFor")}
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
                {i("openOrganization")}
              </button>
            </form>
            {selectedOrg && (
              <p className="mt-3 text-sm text-ink-soft">
                {i("connectionsBelong", { organization: selectedOrg.name })}
              </p>
            )}
            {requestedOrgId && !requestedMembership && selectedOrg && (
              <p role="alert" className="mt-3 text-sm text-risk-medium">
                {i("requestedUnavailable", { organization: selectedOrg.name })}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {ctx
              ? i("adminRequired")
              : i("signInRequired")}
          </p>
        )}
      </section>

      {ctx && !ctx.user.emailVerifiedAt && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-risk-medium/30 bg-risk-medium/5 px-4 py-3 text-sm text-risk-medium"
        >
          {i("verifyBeforeConnecting")}
        </div>
      )}

      <div className="mt-10 space-y-12">
        <section aria-labelledby="data-sources-heading">
          <h2
            id="data-sources-heading"
            className="text-xl font-semibold text-ink"
          >
            {i("dataSourcesHeading")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
            {i("dataSourcesBody")}
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
                  {BYOK_CATEGORY_KEY[category] ? i(BYOK_CATEGORY_KEY[category]!) : category}
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
                          {summaryFor(descriptor)}
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
                {i("remediationHeading")}
              </h2>
              <span className="mono rounded-md border border-risk-medium/40 bg-risk-medium/10 px-2.5 py-1 text-[12px] uppercase tracking-wide text-risk-medium">
                {i("writeCapable")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
              {i("remediationBody")}
            </p>
            <article className="panel mt-4 p-4 sm:p-5">
              <h3 className="text-lg font-medium text-ink">
                {cloudflare.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {i("cloudflareBody")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="mono rounded-sm border border-line px-2 py-1 text-[11px] text-ink-faint">
                  {i("cloudflareScope")}
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
            {i("comingSoonHeading")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
            {i("comingSoonBody")}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {comingSoon.map((connector) => (
              <li
                key={connector.id}
                title={i("comingSoonTooltip")}
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
