import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { connectorStates, INTEGRATION_CATEGORY_LABEL, type IntegrationCategory } from "@/lib/aegis/integrations";

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

export default function IntegrationsPage() {
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
        <div className="mono text-[11px] uppercase tracking-widest text-signal">Aegis · integrations</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Connector registry and remediation previews</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          This registry reports whether provider credentials are configured and maps providers to recommendation categories.
          Aegis currently generates and validates <span className="text-ink">preview-only proposals</span>; this repository
          does not execute provider changes. A configured credential is not evidence that apply, verify, or rollback is implemented.
        </p>
        <div className="mono mt-3 text-xs text-ink-faint">{configuredCount} of {connectors.length} credential sets configured</div>
        <div className="mt-8 space-y-8">
          {Object.entries(groups).map(([category, list]) => (
            <section key={category}>
              <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
                {INTEGRATION_CATEGORY_LABEL[category as IntegrationCategory]}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((connector) => (
                  <div key={connector.id} className="panel flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{connector.name}</div>
                      <span className={`mono rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${connector.connected ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-ink-faint"}`}>
                        {connector.connected ? "Configured" : "Available"}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{connector.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {connector.remediates.map((categoryId) => (
                        <span key={categoryId} className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">
                          {REMEDIATION_LABEL[categoryId] ?? categoryId}
                        </span>
                      ))}
                    </div>
                    <div className="mono mt-3 text-[10px] text-ink-faint">
                      {connector.connected ? `Registry enabled via ${connector.envKey}; preview only` : `Set ${connector.envKey} to register; preview only`}
                    </div>
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
