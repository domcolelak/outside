import { CAPABILITIES, type Capability, type CapabilityType } from "@/lib/capabilities/registry";
import { capabilityTextKey, CATEGORY_KEY } from "@/lib/capabilities/text";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

const TYPE_KEY: Record<CapabilityType, MessageKey<"capabilities">> = {
  discovery_collector: "typeDiscovery",
  enrichment_collector: "typeEnrichment",
  passive_detector: "typeDetection",
  correlation: "typeCorrelation",
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

export default async function CapabilitiesPage() {
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const k = (key: MessageKey<"capabilities">, values?: Record<string, string | number>) => t.t("capabilities", key, values);
  // A capability the catalog does not describe keeps the registry's English,
  // so a newly declared one ships readable rather than showing a key.
  const capName = (c: Capability) => { const key = capabilityTextKey(c.id, "Name"); return key ? k(key) : c.name; };
  const capDescription = (c: Capability) => { const key = capabilityTextKey(c.id, "Description"); return key ? k(key) : c.description; };
  const passive = CAPABILITIES.filter((c) => c.passive).length;
  const baseline = CAPABILITIES.filter((c) => !c.requiresProviderKey).length;
  const keyed = CAPABILITIES.length - baseline;

  const groups = CAPABILITIES.reduce<Record<string, Capability[]>>((acc, c) => {
    (acc[c.type] ??= []).push(c);
    return acc;
  }, {});
  const order: CapabilityType[] = ["discovery_collector", "enrichment_collector", "passive_detector", "correlation"];

  return (
    <>
        <div className="mono text-[12px] uppercase tracking-widest text-signal">{k("kicker")}</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{k("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{k("intro")}</p>

        <div className="mono mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
          <span>{k("statCapabilities", { count: CAPABILITIES.length })}</span>
          <span>{k("statBaseline", { count: baseline })}</span>
          <span>{k("statKeyed", { count: keyed })}</span>
          <span>{k("statPassive", { count: passive })}</span>
        </div>

        <div className="mt-8 space-y-8">
          {order.filter((t) => groups[t]?.length).map((type) => (
            <section key={type}>
              <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">{k(TYPE_KEY[type])}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {groups[type]!.map((c) => (
                  <div key={c.id} className="panel flex flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{capName(c)}</div>
                      <span className={`mono shrink-0 rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide ${c.passive ? "border-signal/30 bg-signal/10 text-signal" : "border-risk-medium/30 bg-risk-medium/10 text-risk-medium"}`}>
                        {c.passive ? k("passive") : k("active")}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{capDescription(c)}</p>
                    {c.detects.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.detects.map((cat) => (
                          <span key={cat} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-faint">{CATEGORY_KEY[cat] ? k(CATEGORY_KEY[cat]!) : cat}</span>
                        ))}
                      </div>
                    )}
                    <div className="mono mt-3 flex items-center justify-between text-[11px] text-ink-faint">
                      <span>{c.requiresProviderKey ? k("needsKey", { provider: c.requiresProviderKey }) : k("alwaysOn")}</span>
                      <span className="truncate pl-2">{c.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </>
  );
}
