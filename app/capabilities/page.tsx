import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { CAPABILITIES, type Capability, type CapabilityType } from "@/lib/capabilities/registry";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<CapabilityType, string> = {
  discovery_collector: "Discovery",
  enrichment_collector: "Enrichment",
  passive_detector: "Detection",
  correlation: "Correlation",
};

const CATEGORY_LABEL: Record<string, string> = {
  "security-headers": "Security headers",
  "insecure-redirect": "Insecure redirect",
  "certificate-expiry": "Certificate expiry",
  "domain-expiry": "Domain expiry",
  "known-vulnerability": "Known vulnerability",
  "exposed-service": "Exposed service",
  "threat-intelligence": "Threat intelligence",
  "breach-exposure": "Breach exposure",
  "mail-security": "Mail security",
  "shadow-asset": "Shadow asset",
  "non-production-exposure": "Non-production",
  "auth-surface": "Auth surface",
  "surface-change": "Surface change",
  "infrastructure-concentration": "Concentration risk",
};

export default function CapabilitiesPage() {
  const passive = CAPABILITIES.filter((c) => c.passive).length;
  const baseline = CAPABILITIES.filter((c) => !c.requiresProviderKey).length;
  const keyed = CAPABILITIES.length - baseline;

  const groups = CAPABILITIES.reduce<Record<string, Capability[]>>((acc, c) => {
    (acc[c.type] ??= []).push(c);
    return acc;
  }, {});
  const order: CapabilityType[] = ["discovery_collector", "enrichment_collector", "passive_detector", "correlation"];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">Back to account</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mono text-[11px] uppercase tracking-widest text-signal">Capability registry</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">What OUTSIDE can detect</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The authoritative, code-backed inventory of every discovery collector, enrichment provider and detector in the
          deterministic pipeline. It describes the product&apos;s abilities — never this instance&apos;s configured keys — and is
          kept honest by a test that fails if a capability drifts from what a real scan produces.
        </p>

        <div className="mono mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
          <span><span className="text-ink">{CAPABILITIES.length}</span> capabilities</span>
          <span><span className="text-ink">{baseline}</span> always-on baseline</span>
          <span><span className="text-ink">{keyed}</span> operator-keyed</span>
          <span><span className="text-ink">{passive}</span> passive</span>
        </div>

        <div className="mt-8 space-y-8">
          {order.filter((t) => groups[t]?.length).map((type) => (
            <section key={type}>
              <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">{TYPE_LABEL[type]}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {groups[type]!.map((c) => (
                  <div key={c.id} className="panel flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{c.name}</div>
                      <span className={`mono shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${c.passive ? "border-signal/30 bg-signal/10 text-signal" : "border-risk-medium/30 bg-risk-medium/10 text-risk-medium"}`}>
                        {c.passive ? "Passive" : "Active"}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{c.description}</p>
                    {c.detects.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.detects.map((cat) => (
                          <span key={cat} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">{CATEGORY_LABEL[cat] ?? cat}</span>
                        ))}
                      </div>
                    )}
                    <div className="mono mt-3 flex items-center justify-between text-[10px] text-ink-faint">
                      <span>{c.requiresProviderKey ? `Needs ${c.requiresProviderKey}` : "Always on"}</span>
                      <span className="truncate pl-2">{c.source}</span>
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
