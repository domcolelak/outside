"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GuardianChecklistItem,
  GuardianEvent,
  GuardianOverview,
  GuardianRecommendation,
  GuardianRecommendationStatus,
  GuardianTargetView,
} from "@/lib/guardian/types";
import { GuardianIntegrations } from "./GuardianIntegrations";
import { EvidenceIntelligencePanel } from "./EvidenceIntelligence";
import { trackFunnel } from "@/lib/analytics/client";
import { useTranslator } from "@/lib/i18n/context";
import { localizeGuardianActivity, localizeGuardianChecklist, localizeGuardianDrift, localizeGuardianEvent, localizeGuardianRecommendation } from "@/lib/guardian/localize";

const riskColor = {
  critical: "text-risk-critical border-risk-critical/25 bg-risk-critical/5",
  high: "text-risk-high border-risk-high/25 bg-risk-high/5",
  medium: "text-risk-medium border-risk-medium/25 bg-risk-medium/5",
  low: "text-signal border-signal/20 bg-signal/5",
  info: "text-accent border-accent/20 bg-accent/5",
};
const stateColor = {
  pass: "text-signal bg-signal/10 border-signal/20",
  warning: "text-risk-medium bg-risk-medium/10 border-risk-medium/20",
  fail: "text-risk-high bg-risk-high/10 border-risk-high/20",
  unknown: "text-ink-faint bg-base-700/40 border-line",
};

function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "default" | "good" | "watch";
}) {
  return (
    <div className="group rounded-xl border border-line bg-base-900/70 p-4 transition hover:border-line-strong hover:bg-base-800/60">
      <div className="mono text-[11px] uppercase tracking-[.16em] text-ink-faint">
        {label}
      </div>
      <div
        className={`mt-3 text-3xl font-semibold tracking-tight ${tone === "good" ? "text-signal" : tone === "watch" ? "text-risk-medium" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-faint">{detail}</div>
    </div>
  );
}

function PostureRing({ score }: { score: number }) {
  const tr = useTranslator();
  const color = score >= 75 ? "#38e1c3" : score >= 50 ? "#f5c451" : "#ff8a5b";
  return (
    <div
      className="relative grid h-40 w-40 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${score * 3.6}deg, rgba(148,173,214,.08) 0)`,
      }}
    >
      <div className="absolute inset-[9px] rounded-full border border-line bg-base-900" />
      <div className="relative text-center">
        <div className="text-4xl font-semibold text-ink">{score}</div>
        <div className="mono mt-1 text-[11px] uppercase tracking-[.2em] text-ink-faint">
          {tr.t("ui", "posture")}
        </div>
      </div>
    </div>
  );
}

function DriftChart({ target }: { target: GuardianTargetView }) {
  const tr = useTranslator();
  const points = target.history
    .slice(-16)
    .map((snapshot) => snapshot.metrics.assets);
  if (points.length < 2)
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line text-center text-xs text-ink-faint">
        {tr.t("guardian", "driftSecondObservation")}
      </div>
    );
  const min = Math.min(...points),
    max = Math.max(...points),
    range = Math.max(1, max - min);
  const coords = points
    .map(
      (value, index) =>
        `${(index / (points.length - 1)) * 100},${88 - ((value - min) / range) * 70}`,
    )
    .join(" ");
  const area = `0,100 ${coords} 100,100`;
  return (
    <div className="relative h-44">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-label={tr.t("guardian", "externalAssetTrend")}
      >
        <defs>
          <linearGradient id="guardian-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38e1c3" stopOpacity=".26" />
            <stop offset="1" stopColor="#38e1c3" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#guardian-area)" />
        <polyline
          points={coords}
          fill="none"
          stroke="#38e1c3"
          strokeWidth="1.7"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="100"
          stroke="rgba(148,173,214,.12)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mono absolute bottom-1 left-0 text-[11px] text-ink-faint">
        {tr.formatDate(
          (
            target.history.at(-16) ??
            target.history[0] ??
            target.latest
          ).observedAt,
        )}
      </div>
      <div className="mono absolute bottom-1 right-0 text-[11px] text-ink-faint">
        {tr.t("guardian", "now")}
      </div>
    </div>
  );
}

function ChecklistCard({ item }: { item: GuardianChecklistItem }) {
  const tr = useTranslator();
  const copy = localizeGuardianChecklist(item, tr);
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((value) => !value)}
      className="w-full rounded-xl border border-line bg-base-900/55 p-4 text-left transition hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{copy.label}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-faint">
            {copy.explanation}
          </div>
        </div>
        <span
          className={`mono rounded-full border px-2 py-1 text-[11px] uppercase tracking-wider ${stateColor[item.state]}`}
        >
          {copy.state}
        </span>
      </div>
      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-xs leading-5">
          <div>
            <span className="text-ink-soft">{tr.t("guardian", "whyItMatters")}</span>
            <p className="text-ink-faint">{copy.whyItMatters}</p>
          </div>
          <div>
            <span className="text-ink-soft">{tr.t("guardian", "recommendedAction")}</span>
            <p className="text-ink-faint">{copy.recommendedAction}</p>
          </div>
          <div className="mono rounded-lg bg-base-950 p-3 text-[11px] text-ink-faint">
            {item.evidence.length ? copy.observation : tr.t("guardian", "notEnoughEvidence")}
          </div>
        </div>
      )}
    </button>
  );
}

function TimelineEvent({ event }: { event: GuardianEvent }) {
  const tr = useTranslator();
  const copy = localizeGuardianEvent(event, tr);
  return (
    <div className="relative pl-8 before:absolute before:left-[7px] before:top-5 before:h-full before:w-px before:bg-line last:before:hidden">
      <div
        className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-base-900 ${event.severity === "critical" || event.severity === "high" ? "bg-risk-high shadow-[0_0_20px_rgba(255,138,91,.4)]" : event.severity === "medium" ? "bg-risk-medium" : "bg-signal"}`}
      />
      <div className="pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`mono rounded-sm border px-1.5 py-0.5 text-[11px] uppercase ${riskColor[event.severity]}`}
          >
            {tr.t("ui", `priority${event.severity[0]!.toUpperCase()}${event.severity.slice(1)}` as Parameters<typeof tr.t<"ui">>[1])}
          </span>
          <span className="mono text-[11px] text-ink-faint">
            {tr.formatDate(event.observedAt, { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <span className="mono text-[11px] uppercase text-ink-faint">
            {copy.category}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-medium text-ink">{copy.title}</h3>
        <p className="mt-1 text-xs leading-5 text-ink-soft">{copy.summary}</p>
        <p className="mt-2 text-xs leading-5 text-ink-faint">
          <span className="text-ink-soft">{tr.t("ui", "why")} · </span>
          {copy.why}
        </p>
        {event.affectedAssets.length > 0 && (
          <div className="mono mt-2 truncate text-[11px] text-accent">
            {event.affectedAssets.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  orgId,
  onUpdate,
}: {
  recommendation: GuardianRecommendation;
  orgId: string;
  onUpdate: (id: string, status: GuardianRecommendationStatus) => void;
}) {
  const tr = useTranslator();
  const copy = localizeGuardianRecommendation(recommendation, tr);
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(0);
  const selected = copy.guides[guide];
  const update = async (status: GuardianRecommendationStatus) => {
    const response = await fetch(
      `/api/guardian/recommendations/${recommendation.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, status }),
      },
    );
    if (response.ok) onUpdate(recommendation.id, status);
  };
  return (
    <article className="rounded-xl border border-line bg-base-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`mono rounded-sm border px-1.5 py-0.5 text-[11px] uppercase ${riskColor[recommendation.priority]}`}
            >
              {tr.t("ui", `priority${recommendation.priority[0]!.toUpperCase()}${recommendation.priority.slice(1)}` as Parameters<typeof tr.t<"ui">>[1])}
            </span>
            <span className="mono text-[11px] uppercase text-ink-faint">
              {tr.t("ui", "confidencePercent", { value: Math.round(recommendation.confidence * 100) })}
            </span>
          </div>
          <h3 className="mt-3 text-base font-medium text-ink">
            {copy.title}
          </h3>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            {copy.reasoning}
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-faint">
            <span className="text-ink-soft">{tr.t("ui", "why")} · </span>
            {copy.why}
          </p>
          {recommendation.affectedAssets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recommendation.affectedAssets.slice(0, 8).map((asset) => (
                <span
                  key={asset}
                  className="mono rounded-sm border border-line bg-base-950/60 px-2 py-1 text-[11px] text-accent"
                >
                  {asset}
                </span>
              ))}
            </div>
          )}
        </div>
        <select
          aria-label={tr.t("guardian", "statusFor", { title: copy.title })}
          value={recommendation.status}
          onChange={(event) =>
            void update(event.target.value as GuardianRecommendationStatus)
          }
          className="mono rounded-lg border border-line bg-base-950 px-2 py-2 text-[11px] text-ink-soft"
        >
          <option value="open">{tr.t("ui", "statusOpen")}</option>
          <option value="acknowledged">{tr.t("ui", "statusAcknowledged")}</option>
          <option value="in_progress">{tr.t("ui", "statusInProgress")}</option>
          <option value="resolved">{tr.t("ui", "statusResolved")}</option>
          <option value="dismissed">{tr.t("ui", "statusDismissed")}</option>
        </select>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-base-950/70 p-3">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            {tr.t("ui", "businessImpact")}
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            {copy.businessImpact}
          </p>
        </div>
        <div className="rounded-lg bg-base-950/70 p-3">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            {tr.t("guardian", "suggestedReview")}
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            {copy.suggestedReview}
          </p>
        </div>
      </div>
      {recommendation.evidence.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-base-950/55 p-3">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            {tr.t("guardian", "deterministicEvidence", { count: recommendation.evidence.length })}
          </div>
          <div className="mt-2 space-y-2">
            {recommendation.evidence.slice(0, 3).map((entry, index) => (
              <div
                key={`${entry.scanId}-${index}`}
                className="text-[12px] leading-5 text-ink-faint"
              >
                <span className="text-ink-soft">{entry.source}</span>
                {entry.asset ? ` · ${entry.asset}` : ""}
                <span> · {tr.t("guardian", "recommendationEvidenceEntry", { scan: entry.scanId })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <EvidenceIntelligencePanel
        orgId={orgId}
        target={recommendation.target}
        findingId={recommendation.id}
      />
      <button
        onClick={() => setOpen((value) => !value)}
        className="mono mt-4 text-[11px] uppercase tracking-wider text-signal"
      >
        {open
          ? tr.t("guardian", "hideRemediation")
          : tr.t("guardian", "openRemediationGuide", { count: recommendation.guides.length })}
      </button>
      {open && selected && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {copy.guides.map((item, index) => (
              <button
                key={item.platform}
                onClick={() => setGuide(index)}
                aria-pressed={index === guide}
                className={`mono rounded-full border px-2.5 py-1 text-[11px] ${index === guide ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-ink-faint"}`}
              >
                {item.platform}
              </button>
            ))}
          </div>
          <h4 className="mt-4 text-sm font-medium text-ink">
            {selected.title}
          </h4>
          <ol className="mt-3 space-y-2">
            {selected.steps.map((step, index) => (
              <li
                key={step}
                className="flex gap-3 text-xs leading-5 text-ink-soft"
              >
                <span className="mono grid h-5 w-5 shrink-0 place-items-center rounded-full bg-signal/10 text-[11px] text-signal">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-signal/15 bg-signal/5 p-3 text-xs text-ink-soft">
            <span className="mono mr-2 text-[11px] uppercase text-signal">
              {tr.t("guardian", "verify")}
            </span>
            {selected.verification}
          </div>
        </div>
      )}
    </article>
  );
}

export function GuardianDashboard({
  initial,
  orgId,
  canAdmin,
}: {
  initial: GuardianOverview;
  orgId: string;
  canAdmin: boolean;
}) {
  const tr = useTranslator();
  const [overview, setOverview] = useState(initial);
  const [selectedTarget, setSelectedTarget] = useState(
    initial.targets[0]?.target ?? "",
  );
  useEffect(() => {
    trackFunnel("guardian_viewed");
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const response = await fetch(
        `/api/guardian?orgId=${encodeURIComponent(orgId)}`,
        { cache: "no-store" },
      );
      if (response.ok && active)
        setOverview((await response.json()) as GuardianOverview);
    };
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orgId]);
  const target =
    overview.targets.find((item) => item.target === selectedTarget) ??
    overview.targets[0];
  const updateRecommendation = (
    id: string,
    status: GuardianRecommendationStatus,
  ) =>
    setOverview((current) => ({
      ...current,
      recommendations: current.recommendations.map((item) =>
        item.id === id ? { ...item, status } : item,
      ),
      targets: current.targets.map((view) => ({
        ...view,
        recommendations: view.recommendations.map((item) =>
          item.id === id ? { ...item, status } : item,
        ),
      })),
    }));
  const certs = useMemo(
    () =>
      target?.latest.inventory
        .filter((item) => typeof item.certDaysToExpiry === "number")
        .sort((a, b) => a.certDaysToExpiry! - b.certDaysToExpiry!)
        .slice(0, 6) ?? [],
    [target],
  );
  if (!target)
    return (
      <div className="panel relative overflow-hidden p-10 text-center">
        <div className="absolute inset-0 grid-backdrop opacity-60" />
        <div className="relative">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-signal/20 bg-signal/5">
            <span className="h-3 w-3 rounded-full bg-signal shadow-glow" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-ink">
            {tr.t("guardian", "baselineReadyTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-soft">
            {tr.t("guardian", "baselineReadyBody")}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/account"
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft"
            >
              {tr.t("guardian", "configureMonitoring")}
            </a>
            <a
              href="/scan"
              className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950"
            >
              {tr.t("guardian", "runVerifiedScan")}
            </a>
          </div>
        </div>
      </div>
    );
  const latest = target.latest;
  const drift = localizeGuardianDrift(target.drift, tr);
  const driftTone =
    target.drift.direction === "improving"
      ? "text-signal"
      : target.drift.direction === "worsening"
        ? "text-risk-high"
        : target.drift.direction === "watch"
          ? "text-risk-medium"
          : "text-ink-soft";
  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden p-6 md:p-8">
        <div className="absolute inset-0 grid-backdrop opacity-25" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-30" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
              </span>
              <span className="mono text-[11px] uppercase tracking-[.2em] text-signal">
                {tr.t("guardian", "active")}
              </span>
              <select
                aria-label={tr.t("guardian", "targetLabel")}
                value={target.target}
                onChange={(event) => setSelectedTarget(event.target.value)}
                className="mono rounded-md border border-line bg-base-950/80 px-2 py-1 text-[11px] text-ink-soft"
              >
                {overview.targets.map((item) => (
                  <option key={item.target}>{item.target}</option>
                ))}
              </select>
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {tr.t("guardian", "externalPresence", {
                direction: tr.t("guardian", `driftDirection${target.drift.direction[0]!.toUpperCase()}${target.drift.direction.slice(1)}` as Parameters<typeof tr.t<"guardian">>[1]),
              })}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
              {drift.narrative}
            </p>
            <div className="mono mt-5 text-[11px] text-ink-faint">
              {tr.t("guardian", "lastAnalyzed", {
                date: tr.formatDate(latest.observedAt, { dateStyle: "medium", timeStyle: "short" }),
                scanId: latest.scanId.slice(0, 16),
                storage: tr.t("guardian", overview.durable ? "durableHistory" : "developmentMemory"),
              })}
            </div>
          </div>
          <PostureRing score={latest.exposureScore} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label={tr.t("guardian", "metricObservedAssets")}
          value={latest.metrics.assets}
          detail={tr.t("guardian", "metricWebFacing", { count: latest.metrics.webSurfaces })}
        />
        <Metric
          label={tr.t("guardian", "metricShadowReview")}
          value={latest.metrics.shadowAssets}
          detail={tr.t("guardian", "metricOwnershipSignals")}
          tone={latest.metrics.shadowAssets ? "watch" : "good"}
        />
        <Metric
          label={tr.t("guardian", "metricIdentitySurfaces")}
          value={latest.metrics.authSurfaces}
          detail={tr.t("guardian", "metricApiRelated", { count: latest.metrics.apiSurfaces })}
        />
        <Metric
          label={tr.t("guardian", "metricChecklist")}
          value={`${latest.metrics.checklistPassed}/10`}
          detail={tr.t("guardian", "metricActionable", { count: latest.metrics.checklistActionable })}
          tone={latest.metrics.checklistActionable ? "watch" : "good"}
        />
        <Metric
          label={tr.t("guardian", "metricComplexity")}
          value={latest.metrics.complexityIndex}
          detail={tr.t("guardian", "metricProviders", { count: latest.metrics.infrastructureProviders })}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="panel p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
                {tr.t("guardian", "exposureDrift")}
              </div>
              <h2 className={`mt-2 text-xl font-medium ${driftTone}`}>
                {drift.headline}
              </h2>
            </div>
            <span className="mono rounded-full border border-line px-2 py-1 text-[11px] uppercase text-ink-faint">
              {tr.t("guardian", "observationCount", { count: target.history.length })}
            </span>
          </div>
          <DriftChart target={target} />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {drift.dimensions
              .filter((item) => item.direction !== "stable")
              .slice(0, 3)
              .map((item) => (
                <div
                  key={item.code}
                  className="rounded-lg border border-line bg-base-950/60 p-3"
                >
                  <div className="mono text-[11px] text-ink-faint">
                    {item.label}
                  </div>
                  <div
                    className={`mt-1 text-sm ${item.direction === "improving" ? "text-signal" : "text-risk-medium"}`}
                  >
                    {item.delta > 0 ? "+" : ""}
                    {item.delta}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="panel p-5 md:p-6">
          <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
            {tr.t("guardian", "renewalHorizon")}
          </div>
          <h2 className="mt-2 text-xl font-medium text-ink">
            {tr.t("guardian", "certificatesAndDomains")}
          </h2>
          <div className="mt-5 space-y-3">
            {certs.length ? (
              certs.map((item) => (
                <div
                  key={item.canonical}
                  className="flex items-center justify-between gap-4 rounded-lg border border-line bg-base-950/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="mono truncate text-[12px] text-ink-soft">
                      {item.canonical}
                    </div>
                    <div className="mono mt-1 text-[11px] text-ink-faint">
                      {item.certNotAfter
                        ? tr.formatDate(item.certNotAfter)
                        : tr.t("guardian", "dateUnavailable")}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-medium ${(item.certDaysToExpiry ?? 100) <= 30 ? "text-risk-high" : "text-signal"}`}
                  >
                    {tr.t("guardian", "daysShort", { count: item.certDaysToExpiry ?? 0 })}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-faint">
                {tr.t("guardian", "noCertificateEvidence")}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <div className="panel max-h-[760px] overflow-hidden p-5 md:p-6">
          <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
            {tr.t("guardian", "changeIntelligence")}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <h2 className="text-xl font-medium text-ink">{tr.t("guardian", "timeline")}</h2>
            <span className="mono text-[11px] text-ink-faint">
              {tr.t("guardian", "correlatedCount", { count: target.events.length })}
            </span>
          </div>
          <div className="scroll-thin mt-6 max-h-[650px] overflow-y-auto pr-2">
            {target.events.length ? (
              target.events.map((event) => (
                <TimelineEvent key={event.id} event={event} />
              ))
            ) : (
              <p className="text-sm text-ink-faint">
                {tr.t("guardian", "noMeaningfulChanges")}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
                {tr.t("guardian", "analystQueue")}
              </div>
              <h2 className="mt-2 text-xl font-medium text-ink">
                {tr.t("guardian", "recommendations")}
              </h2>
            </div>
            <span className="mono text-[11px] text-ink-faint">
              {tr.t("guardian", "deterministicOnly")}
            </span>
          </div>
          {target.recommendations.filter(
            (item) => item.status !== "resolved" && item.status !== "dismissed",
          ).length ? (
            target.recommendations
              .filter(
                (item) =>
                  item.status !== "resolved" && item.status !== "dismissed",
              )
              .slice(0, 8)
              .map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  orgId={orgId}
                  onUpdate={updateRecommendation}
                />
              ))
          ) : (
            <div className="panel p-8 text-center text-sm text-ink-faint">
              {tr.t("guardian", "noOpenReviewItems")}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
              {tr.t("guardian", "livingControls")}
            </div>
            <h2 className="mt-2 text-xl font-medium text-ink">
              {tr.t("guardian", "securityChecklist")}
            </h2>
          </div>
          <span className="mono text-[11px] text-ink-faint">
            {tr.t("guardian", "clickControlEvidence")}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {latest.checklist.map((item) => (
            <ChecklistCard key={item.code} item={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <GuardianIntegrations
          orgId={orgId}
          initialChannels={overview.channels}
          canAdmin={canAdmin}
        />
        <div className="panel p-5 md:p-6">
          <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">
            {tr.t("guardian", "operations")}
          </div>
          <h2 className="mt-2 text-xl font-medium text-ink">
            {tr.t("guardian", "activityDelivery")}
          </h2>
          <div className="mt-5 space-y-4">
            {overview.activity.slice(0, 7).map((item) => (
              <div key={item.id} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                <div>
                  <div className="text-xs text-ink-soft">{localizeGuardianActivity(item, tr)}</div>
                  <div className="mono mt-1 text-[11px] text-ink-faint">
                    {tr.formatDate(item.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              </div>
            ))}
            {overview.activity.length === 0 && (
              <p className="text-xs text-ink-faint">
                {tr.t("guardian", "activityEmpty")}
              </p>
            )}
          </div>
          {overview.deliveries.length > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
                {tr.t("guardian", "recentDeliveries")}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {overview.deliveries.slice(0, 6).map((delivery) => (
                  <div
                    key={delivery.id}
                    className="flex items-center justify-between rounded-lg bg-base-950/60 p-3"
                  >
                    <div>
                      <div className="mono text-[11px] text-ink-soft">
                        {delivery.channelType.replace("_", " ")}
                      </div>
                      <div className="mono mt-1 text-[11px] text-ink-faint">
                        {tr.t("guardian", "deliveryMeta", { items: delivery.itemCount, attempts: delivery.attempts })}
                      </div>
                    </div>
                    <span
                      className={`mono text-[11px] uppercase ${delivery.status === "sent" ? "text-signal" : delivery.status === "failed" ? "text-risk-high" : "text-risk-medium"}`}
                    >
                      {tr.t("guardian", `delivery${delivery.status[0]!.toUpperCase()}${delivery.status.slice(1)}` as Parameters<typeof tr.t<"guardian">>[1])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
