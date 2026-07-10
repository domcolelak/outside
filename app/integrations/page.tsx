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
  const connectedCount = connectors.filter((c) => c.connected).length;
  const groups = connectors.reduce<Record<string, typeof connectors>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">← Account</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mono text-[11px] uppercase tracking-widest text-signal">Aegis · integrations</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Connect a provider, let Aegis act</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Integrations are never required — OUTSIDE works fully with none connected. When you connect a provider, Aegis can
          enrich its observations and <span className="text-ink">apply the fixes it already recommends</span> — always
          previewable, approved, audited, and rollback-capable. Nothing is ever changed automatically.
        </p>
        <div className="mono mt-3 text-xs text-ink-faint">{connectedCount} of {connectors.length} connected</div>

        <div className="mt-8 space-y-8">
          {Object.entries(groups).map(([category, list]) => (
            <section key={category}>
              <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
                {INTEGRATION_CATEGORY_LABEL[category as IntegrationCategory]}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((c) => (
                  <div key={c.id} className="panel flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{c.name}</div>
                      {c.connected ? (
                        <span className="mono rounded-md border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-signal">Connected</span>
                      ) : (
                        <span className="mono rounded-md border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">Available</span>
                      )}
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{c.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.remediates.map((r) => (
                        <span key={r} className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">{REMEDIATION_LABEL[r] ?? r}</span>
                      ))}
                    </div>
                    <div className="mono mt-3 text-[10px] text-ink-faint">
                      {c.connected ? `Configured via ${c.envKey}` : `Set ${c.envKey} to enable`}
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
