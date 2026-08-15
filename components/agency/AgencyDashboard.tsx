"use client";

import { useTranslator } from "@/lib/i18n/context";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PortfolioOverview } from "@/lib/agency/types";
const healthStyle = {
  healthy: "border-signal/25 bg-signal/5 text-signal",
  watch: "border-risk-medium/30 bg-risk-medium/5 text-risk-medium",
  at_risk: "border-risk-high/30 bg-risk-high/5 text-risk-high",
  unknown: "border-line bg-base-800 text-ink-faint",
};
const HEALTH_KEY = {
  healthy: "healthHealthy",
  watch: "healthWatch",
  at_risk: "healthAtRisk",
  unknown: "healthUnknown",
} as const;

export function AgencyDashboard({ initial }: { initial: PortfolioOverview }) {
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1], values?: Record<string, string | number>) =>
    tr.t("agency", key, values);

  const [data, setData] = useState(initial),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      Array<{ type: string; clientName: string; label: string; detail: string }>
    >([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(""),
    [operationError, setOperationError] = useState("");
  const searchSequence = useRef(0);
  const groups = useMemo(
    () => new Map(data.groups.map((g) => [g.id, g])),
    [data.groups],
  );
  async function search(value: string) {
    const sequence = ++searchSequence.current;
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/agency/search?agencyId=${data.workspace.id}&q=${encodeURIComponent(value)}`,
      );
      const d = await r.json();
      if (sequence === searchSequence.current) setResults(r.ok ? (d.results ?? []) : []);
    } catch {
      if (sequence === searchSequence.current) setResults([]);
    }
  }
  async function operation(type: "scan" | "report") {
    if (!selected.length) return;
    setBusy(type);
    setOperationError("");
    try {
      const r = await fetch(
        `/api/agency/operations?agencyId=${data.workspace.id}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `${type}:${[...selected].sort().join(",")}:${new Date().toISOString().slice(0, 13)}`,
          },
          body: JSON.stringify({ type, clientOrgIds: selected }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error ?? g("bulkNotScheduled"));
      }
      const freshResponse = await fetch(`/api/agency?agencyId=${data.workspace.id}`);
      if (!freshResponse.ok) throw new Error(g("bulkScheduledNoRefresh"));
      setData(await freshResponse.json());
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : g("bulkFailed"));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-base-900 p-6 md:p-8">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mono text-[11px] uppercase tracking-[.22em] text-signal">
              {g("kicker")}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-gradient md:text-5xl">
              {data.workspace.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-ink-soft">
              {g("intro", { count: data.clients.length })}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/account"
              className="rounded-lg border border-line px-4 py-2 text-xs text-ink-soft"
            >
              {g("workspaceLink")}
            </Link>
            <span className="rounded-lg border border-signal/20 bg-signal/5 px-4 py-2 mono text-xs text-signal">
              {data.role}
            </span>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          [data.portfolioScore ?? "—", g("statPortfolioPosture")],
          [data.clients.length, g("statCustomers")],
          [data.totalAssets, g("statAssets")],
          [data.criticalFindings, g("statCritical")],
          [data.slaBreaches, g("statSlaBreached")],
          [data.unknownClients, g("statNeedData")],
        ].map(([v, l]) => (
          <div key={l} className="panel p-4">
            <div className="text-2xl font-semibold text-ink">{v}</div>
            <div className="mono mt-2 text-[11px] uppercase tracking-wider text-ink-faint">
              {l}
            </div>
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <div className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
                {g("heatmapKicker")}
              </div>
              <h2 className="mt-1 text-lg font-medium">{g("heatmapHeading")}</h2>
            </div>
            <div className="flex gap-2">
              <button
                disabled={!selected.length || !!busy}
                onClick={() => operation("scan")}
                className="rounded-md border border-line px-3 py-2 mono text-[11px] text-ink-soft disabled:opacity-40"
              >
                {busy === "scan" ? g("bulkScanBusy") : g("bulkScan")}
              </button>
              <button
                disabled={!selected.length || !!busy}
                onClick={() => operation("report")}
                className="rounded-md bg-signal px-3 py-2 mono text-[11px] font-semibold text-base-950 disabled:opacity-40"
              >
                {busy === "report" ? g("bulkReportsBusy") : g("bulkReports")}
              </button>
            </div>
          </div>
          {operationError && <p role="alert" className="mono mt-3 text-[11px] text-risk-high">{operationError}</p>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.clients.map((item) => (
              <label
                key={item.client.id}
                className={`relative cursor-pointer rounded-xl border p-4 transition hover:-translate-y-0.5 ${healthStyle[item.health]}`}
              >
                <input
                  type="checkbox"
                  className="absolute right-3 top-3 accent-current"
                  checked={selected.includes(item.client.orgId)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, item.client.orgId]
                        : selected.filter((x) => x !== item.client.orgId),
                    )
                  }
                />
                <div className="pr-6 font-medium">
                  {item.client.organizationName}
                </div>
                <div className="mono mt-1 text-[11px] uppercase opacity-70">
                  {groups.get(item.client.groupId ?? "")?.name ??
                    item.client.serviceTier}
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <span>
                    <span className="text-3xl font-semibold">
                      {item.exposureScore ?? "—"}
                    </span>
                    {item.exposureScore !== null && (
                      <span className="mono ml-1 text-[11px] uppercase opacity-70">
                        {g("postureSuffix")}
                      </span>
                    )}
                  </span>
                  <span className="mono text-[11px] uppercase">
                    {g(HEALTH_KEY[item.health])}
                  </span>
                </div>
                <div className="mt-3 flex gap-3 text-[11px] opacity-80">
                  <span>{g("cardAssets", { count: item.assets })}</span>
                  <span>{g("cardOpen", { count: item.openRecommendations })}</span>
                  <span>{g("cardSla", { count: item.slaBreaches })}</span>
                </div>
              </label>
            ))}
          </div>
          {!data.clients.length && (
            <div className="mt-8 rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
              {g("emptyPortfolio")}
            </div>
          )}
        </div>
        <aside className="panel p-5">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            Cross-customer search
          </div>
          <input
            aria-label={g("searchLabel")}
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder={g("searchPlaceholder")}
            className="mt-3 w-full rounded-lg border border-line bg-base-950 px-3 py-2.5 text-sm outline-hidden focus:border-signal/40"
          />
          <div className="scroll-thin mt-3 max-h-[430px] space-y-2 overflow-auto">
            {results.map((r, i) => (
              <div
                key={`${r.clientName}-${i}`}
                className="rounded-lg border border-line bg-base-950/60 p-3"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-xs text-ink">{r.label}</span>
                  <span className="mono text-[10px] uppercase text-signal">
                    {r.type}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {r.clientName} · {r.detail}
                </div>
              </div>
            ))}
            {query.length >= 2 && !results.length && (
              <div className="py-8 text-center text-xs text-ink-faint">
                No deterministic evidence matched.
              </div>
            )}
          </div>
        </aside>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            Cross-customer change feed
          </div>
          <div className="mt-4 space-y-3">
            {data.recentChanges.slice(0, 12).map((e) => (
              <div
                key={`${e.clientOrgId}-${e.id}`}
                className="flex gap-3 border-b border-line pb-3"
              >
                <span className="mt-1.5 h-2 w-2 rounded-full bg-signal" />
                <div>
                  <div className="text-xs text-ink">{e.title}</div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    {e.clientName} · {e.summary}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-5">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">
            Analyst priority queue
          </div>
          <div className="mt-4 space-y-3">
            {data.topRecommendations.slice(0, 12).map((r) => (
              <div
                key={`${r.clientOrgId}-${r.id}`}
                className="rounded-lg border border-line p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-ink">{r.title}</div>
                  <span className="mono text-[11px] uppercase text-risk-high">
                    {r.priority}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  {r.clientName} · {r.why}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
