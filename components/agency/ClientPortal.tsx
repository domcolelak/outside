"use client";

import { useTranslator } from "@/lib/i18n/context";

import { useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import type { GuardianEvent, GuardianRecommendation } from "@/lib/guardian/types";
import { localizeGuardianEvent, localizeGuardianRecommendation } from "@/lib/guardian/localize";

type Portal = {
  workspace: { id: string; name: string; branding: { whiteLabel: boolean; logoUrl: string | null; primaryColor: string; accentColor: string; supportEmail: string | null; emailFooter: string | null } };
  client: { organizationName: string };
  posture: Array<{ target: string; latest: { exposureScore: number; metrics: { assets: number; shadowAssets: number }; checklist: Array<{ code: string; label: string; state: string; whyItMatters: string; recommendedAction: string }> } }>;
  recommendations: GuardianRecommendation[];
  notes: Array<{ id: string; body: string; createdAt: string }>;
  reports: Array<{ id: string; title: string; kind: "client" | "portfolio" | "executive"; createdAt: string }>;
  recentChanges: GuardianEvent[];
};

export function ClientPortal() {
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);
  const query = useSearchParams(); const [data, setData] = useState<Portal | null>(null); const [error, setError] = useState("");
  useEffect(() => { fetch(`/api/agency/portal?agencyId=${encodeURIComponent(query.get("agencyId") ?? "")}&clientId=${encodeURIComponent(query.get("clientId") ?? "")}`).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error("portal"); setData(result); }).catch(() => setError(tr.t("agency", "portalUnavailable"))); }, [query, tr]);
  if (error) return <div className="panel p-8 text-risk-high">{error}</div>;
  if (!data) return <div className="panel p-8 text-ink-soft">{g("portalLoading")}</div>;
  const brand = data.workspace.branding; const style = { "--agency-primary": brand.primaryColor, "--agency-accent": brand.accentColor } as CSSProperties;
  return <div className="space-y-6" style={style}>
    <section className="panel overflow-hidden p-7" style={{ borderTopColor: brand.primaryColor, borderTopWidth: 3 }}><div className="flex items-center gap-4">{brand.logoUrl && <img src={brand.logoUrl} alt={g("portalLogoAlt", { agency: data.workspace.name })} referrerPolicy="no-referrer" decoding="async" className="h-10 max-w-40 object-contain" />}<div><div className="mono text-[11px] uppercase tracking-[.2em]" style={{ color: brand.primaryColor }}>{g("portalHeading")}</div><h1 className="mt-2 text-4xl font-semibold text-gradient">{data.client.organizationName}</h1><p className="mt-2 text-sm text-ink-soft">{g("portalPreparedBy", { agency: data.workspace.name })}</p></div></div></section>
    <section className="grid gap-3 md:grid-cols-3">{data.posture.map((posture) => <div key={posture.target} className="panel p-5"><div className="mono text-[11px] text-ink-faint">{posture.target}</div><div className="mono mt-3 text-[11px] uppercase tracking-wider text-ink-faint">{g("portalPosture")}</div><div className="mt-1 text-4xl font-semibold" style={{ color: brand.primaryColor }}>{posture.latest.exposureScore}<span className="ml-1 text-sm font-normal text-ink-faint">/100</span></div><div className="mt-2 text-xs text-ink-soft">{g("portalAssetsShadow", { assets: posture.latest.metrics.assets, shadow: posture.latest.metrics.shadowAssets })}</div></div>)}</section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="panel p-5"><div className="mono text-[11px] uppercase text-ink-faint">{g("portalSharedItems")}</div><div className="mt-4 space-y-3">{data.recommendations.map((recommendation) => { const copy = localizeGuardianRecommendation(recommendation, tr); return <article key={recommendation.id} className="rounded-xl border border-line p-4"><div className="flex justify-between gap-3"><h2 className="text-sm text-ink">{copy.title}</h2><span className="mono text-[11px] uppercase text-risk-high">{g(`severity${recommendation.priority[0]!.toUpperCase()}${recommendation.priority.slice(1)}` as Parameters<typeof tr.t<"agency">>[1])}</span></div><p className="mt-2 text-xs leading-5 text-ink-soft">{copy.why}</p><p className="mt-2 text-[12px] text-ink-faint">{g("portalBusinessImpact", { impact: copy.businessImpact })}</p><p className="mt-1 text-[12px] text-ink-faint">{g("portalReview", { review: copy.suggestedReview })}</p></article>; })}{!data.recommendations.length && <p className="text-sm text-ink-faint">{g("portalNoShared")}</p>}</div></div><div className="panel p-5"><div className="mono text-[11px] uppercase text-ink-faint">{g("portalRecentChanges")}</div><div className="mt-4 space-y-3">{data.recentChanges.map((event) => { const copy = localizeGuardianEvent(event, tr); return <div key={event.id} className="border-b border-line pb-3"><div className="text-xs text-ink">{copy.title}</div><div className="mt-1 text-[12px] text-ink-faint">{copy.summary}</div></div>; })}</div></div></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="panel p-5"><div className="mono text-[11px] uppercase text-ink-faint">{g("portalReports")}</div><div className="mt-4 space-y-2">{data.reports.map((report) => { const suffix = `${report.kind[0]!.toUpperCase()}${report.kind.slice(1)}` as "Client" | "Portfolio" | "Executive"; return <a key={report.id} href={`/api/agency/reports/${report.id}?agencyId=${data.workspace.id}`} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm hover:border-signal/30"><span>{g(`reportTitle${suffix}`, { client: data.client.organizationName })}</span><span className="mono text-[11px] text-ink-faint">{g("portalReportMeta", { date: tr.formatDate(report.createdAt) })}</span></a>;})}{!data.reports.length && <p className="text-sm text-ink-faint">{g("portalNoReports")}</p>}</div></div><div className="panel p-5"><div className="mono text-[11px] uppercase text-ink-faint">{g("portalNotes")}</div><div className="mt-4 space-y-3">{data.notes.map((note) => <div key={note.id} className="rounded-lg border border-line p-3"><p className="text-sm leading-6 text-ink-soft">{note.body}</p><div className="mono mt-2 text-[11px] text-ink-faint">{tr.formatDate(note.createdAt, { dateStyle: "medium", timeStyle: "short" })}</div></div>)}{!data.notes.length && <p className="text-sm text-ink-faint">{g("portalNoNotes")}</p>}</div></div></section>
    {(brand.supportEmail || brand.emailFooter) && <footer className="px-2 text-center text-[12px] text-ink-faint">{brand.emailFooter ?? <>{g("portalQuestions")}<a href={`mailto:${brand.supportEmail}`} style={{ color: brand.primaryColor }}>{brand.supportEmail}</a></>}</footer>}
  </div>;
}
