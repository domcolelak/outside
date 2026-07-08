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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="mono text-xs uppercase tracking-wider text-ink-faint">{KIND_LABEL[asset.kind] ?? asset.kind}</div>
          <div className="mono mt-1 break-all text-[15px] text-ink">{asset.label}</div>
        </div>
        <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-base-700">
          Close
        </button>
      </div>

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
              <div key={i} className="rounded-lg border border-line bg-base-850 p-3">
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
          <div className="flex flex-wrap gap-1.5">
            {asset.discoveredVia.map((m) => (
              <Chip key={m} tone="signal">{m}</Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">First observed {new Date(asset.firstObservedAt).toLocaleString()}</p>
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
