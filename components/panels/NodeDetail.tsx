"use client";

import type { Asset } from "@/lib/types";
import { AssuranceTag, Chip, Confidence, PriorityDot, PRIORITY_STYLE } from "@/components/ui";

const KIND_LABEL: Record<string, string> = {
  root_domain: "Root domain",
  subdomain: "Subdomain",
  web_service: "Web service",
  api_surface: "API surface",
  auth_surface: "Authentication surface",
  mail_service: "Mail service",
  cdn: "CDN / edge",
  third_party: "Third-party service",
  cloud_provider: "Cloud provider",
  nameserver: "Nameserver",
  certificate: "Certificate",
  technology: "Technology",
  unknown: "Unknown asset",
};

export function NodeDetail({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const tech = (asset.attrs.technologies as string[] | undefined) ?? [];
  const protocols = (asset.attrs.protocols as string[] | undefined) ?? [];
  const addresses = (asset.attrs.addresses as string[] | undefined) ?? [];
  const cnames = (asset.attrs.cnames as string[] | undefined) ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="relative overflow-hidden border-b border-line px-4 py-4"><div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-signal/10 blur-3xl"/><div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="mono text-xs uppercase tracking-wider text-ink-faint">{KIND_LABEL[asset.kind] ?? asset.kind}</div>
          <div className="mono mt-1 break-all text-[15px] text-ink">{asset.label}</div>
        </div>
        <button onClick={onClose} aria-label="Close asset inspection" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-sm text-ink-faint transition hover:border-line-strong hover:text-ink">
          ×
        </button>
      </div></div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-md border border-line px-2 py-1">
            <PriorityDot priority={asset.priority} />
            <span className="text-xs text-ink-soft">{PRIORITY_STYLE[asset.priority].label} review priority</span>
          </span>
          {protocols.map((p) => (
            <Chip key={p}>{p}</Chip>
          ))}
          {asset.attrs.status ? <Chip>HTTP {String(asset.attrs.status)}</Chip> : null}
        </div>

        <div className="rounded-xl border border-line bg-base-950/50 p-3"><div className="mono text-[9px] uppercase tracking-wider text-ink-faint">Asset lens</div><div className="mt-3 grid grid-cols-3 gap-2 text-center">{[[asset.evidence.length,"evidence"],[asset.signals.length,"signals"],[asset.discoveredVia.length,"paths"]].map(([value,label]) => <div key={label} className="rounded-lg bg-base-900 p-2"><div className="text-lg font-medium text-ink">{value}</div><div className="mono text-[8px] uppercase text-ink-faint">{label}</div></div>)}</div></div>

        {(addresses.length > 0 || cnames.length > 0) && <Section title="Observed routing"><div className="space-y-2">{addresses.map((address) => <div key={address} className="mono flex items-center gap-2 rounded-lg border border-line bg-base-950/40 px-3 py-2 text-[10px] text-ink-soft"><span className="h-1.5 w-1.5 rounded-full bg-signal"/>{address}</div>)}{cnames.map((cname) => <div key={cname} className="mono flex items-center gap-2 rounded-lg border border-line bg-base-950/40 px-3 py-2 text-[10px] text-accent"><span className="text-ink-faint">CNAME →</span>{cname}</div>)}</div></Section>}

        <Section title="Org attribution confidence">
          <Confidence value={asset.orgConfidence} />
          <p className="mt-1 text-xs text-ink-faint">How confident OUTSIDE is that this asset belongs to the target organization.</p>
        </Section>

        {tech.length > 0 && (
          <Section title="Technology signals">
            <div className="flex flex-wrap gap-1.5">
              {tech.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </Section>
        )}

        {asset.signals.length > 0 && (
          <Section title="Signals">
            <div className="space-y-2">
              {asset.signals.map((s) => (
                <div key={s.code} className="rounded-lg border border-line bg-base-850 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] text-ink">{s.label}</span>
                    <AssuranceTag assurance={s.assurance} />
                  </div>
                  <div className="mt-2"><Confidence value={s.confidence} /></div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">{s.rationale}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Evidence">
          <div className="space-y-2">
            {asset.evidence.map((e, i) => (
              <div key={i} className="motion-card relative rounded-lg border border-line bg-base-850 p-3 pl-10">
                <span className="mono absolute left-3 top-3 grid h-5 w-5 place-items-center rounded-full border border-signal/20 bg-signal/5 text-[8px] text-signal">{i + 1}</span>
                <div className="flex items-center justify-between">
                  <span className="mono text-[11px] uppercase tracking-wide text-signal">{e.provider}</span>
                  <span className="mono text-[10px] text-ink-faint">{e.method}</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-soft">{e.summary}</p>
                {e.detail && <p className="mono mt-1 text-[11px] text-ink-faint">{e.detail}</p>}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Discovery">
          <div className="flex flex-wrap items-center gap-1.5">
            {asset.discoveredVia.map((m, index) => (
              <span key={m} className="contents">{index > 0 && <span className="text-ink-faint">→</span>}<Chip tone="signal">{m}</Chip></span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-ink-faint"><div><span className="mono block text-[8px] uppercase">First observed</span>{new Date(asset.firstObservedAt).toLocaleString()}</div><div><span className="mono block text-[8px] uppercase">Last observed</span>{new Date(asset.lastObservedAt).toLocaleString()}</div></div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono mb-2 text-[11px] uppercase tracking-wider text-ink-faint">{title}</div>
      {children}
    </div>
  );
}
