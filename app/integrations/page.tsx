import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { connectorStates, INTEGRATION_CATEGORY_LABEL, type IntegrationCategory } from "@/lib/aegis/integrations";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { CloudflareConnector } from "@/components/integrations/CloudflareConnector";

export const dynamic = "force-dynamic";

const REMEDIATION_LABEL: Record<string, string> = {
  mail_security: "Mail security",
  security_headers: "Security headers",
  certificate_lifecycle: "Certificates",
  non_production_exposure: "Non-production",
  shadow_asset: "Shadow assets",
  auth_surface: "Auth surfaces",
  api_surface: "API surfaces",
  third_party: "Third-party",
  surface_change: "Surface change",
};

export default async function IntegrationsPage() {
  const ctx = await getSessionContext();
  // Connecting a provider stores a credential that can change live DNS, so it is
  // an owner/admin action on a specific organization.
  const adminOrg = ctx?.memberships.find((membership) => roleAtLeast(membership.role, "admin"))?.org ?? null;
  const canConnect = !!ctx?.user.emailVerifiedAt && !!adminOrg;

  const connectors = connectorStates();
  const configuredCount = connectors.filter((connector) => connector.connected).length;
  const groups = connectors.reduce<Record<string, typeof connectors>>((acc, connector) => {
    (acc[connector.category] ??= []).push(connector);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">Back to account</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mono text-[12px] uppercase tracking-widest text-signal">Aegis · integrations</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Connect your infrastructure</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Connecting a provider lets OUTSIDE confirm findings against your real configuration instead of inferring them from
          the outside. <span className="text-ink">Cloudflare can be connected here</span> with your own API token — we verify it,
          store it encrypted, and never show it again. The remaining providers are operator-configured and remain read-only
          previews until they are built.
        </p>
        {!canConnect && (
          <div className="mt-4 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">
            {!ctx
              ? <>Sign in as an organization owner or admin to connect a provider.</>
              : !ctx.user.emailVerifiedAt
                ? <>Verify your email address to connect a provider.</>
                : <>Connecting requires owner or admin access to an organization.</>}
          </div>
        )}
        <div className="mono mt-3 text-xs text-ink-faint">{configuredCount} of {connectors.length} operator credential sets configured</div>
        <div className="mt-8 space-y-8">
          {Object.entries(groups).map(([category, list]) => (
            <section key={category}>
              <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">
                {INTEGRATION_CATEGORY_LABEL[category as IntegrationCategory]}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((connector) => (
                  <div key={connector.id} className="panel flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{connector.name}</div>
                      <span className={`mono rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide ${connector.connected ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-ink-faint"}`}>
                        {connector.connected ? "Configured" : "Available"}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {connector.remediates.map((categoryId) => (
                        <span key={categoryId} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-faint">
                          {REMEDIATION_LABEL[categoryId] ?? categoryId}
                        </span>
                      ))}
                    </div>
                    {connector.id === "cloudflare" ? (
                      canConnect && adminOrg
                        ? <CloudflareConnector orgId={adminOrg.id} orgName={adminOrg.name} />
                        : <div className="mono mt-3 text-[11px] text-ink-faint">Sign in as an owner or admin to connect your Cloudflare account.</div>
                    ) : (
                      <div className="mono mt-3 text-[11px] text-ink-faint">
                        {connector.connected ? `Operator-configured via ${connector.envKey}; read-only preview` : `Not built yet — read-only preview`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
