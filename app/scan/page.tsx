"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useScan } from "@/components/useScan";
import { AssetGraph } from "@/components/graph/AssetGraph";
import { ScanConsole } from "@/components/panels/ScanConsole";
import { Summary } from "@/components/panels/Summary";
import { NodeDetail } from "@/components/panels/NodeDetail";
import { AttackerView } from "@/components/AttackerView";
import { VerifyPanel } from "@/components/VerifyPanel";
import { Wordmark } from "@/components/Wordmark";

function ScanView() {
  const params = useSearchParams();
  const target = params.get("target");
  const mode = (params.get("mode") === "demo" ? "demo" : "auto") as "auto" | "demo";
  const scan = useScan(target, mode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attacker, setAttacker] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<"none" | "pending" | "verified">("none");

  const resultTarget = scan.result?.target;
  const resultIsDemo = scan.result?.isDemo;
  useEffect(() => {
    if (!resultTarget || resultIsDemo) return;
    fetch(`/api/verify?domain=${encodeURIComponent(resultTarget)}`)
      .then((r) => r.json())
      .then((d) => setVerifyStatus(d.status === "verified" ? "verified" : d.status === "pending" ? "pending" : "none"))
      .catch(() => {});
  }, [resultTarget, resultIsDemo]);

  const selected = useMemo(() => scan.assets.find((a) => a.id === selectedId) ?? null, [scan.assets, selectedId]);

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-ink-soft">No target specified.</p>
          <Link href="/" className="mono mt-3 inline-block text-sm text-signal hover:underline">← Back to start</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-4">
          <Link href="/"><Wordmark className="h-5" /></Link>
          <div className="hidden items-center gap-2 md:flex">
            <span className="mono rounded-md border border-line px-2 py-1 text-xs text-ink">{scan.result?.target ?? target}</span>
            <span className="mono rounded-md border border-line px-2 py-1 text-[11px] uppercase tracking-wider text-ink-faint">
              {mode === "demo" || scan.result?.isDemo ? "Demo" : "Passive external view"}
            </span>
            {scan.result && !scan.result.isDemo && (
              verifyStatus === "verified" ? (
                <span className="mono rounded-md border border-signal/40 bg-signal/10 px-2 py-1 text-[11px] uppercase tracking-wider text-signal">
                  ✓ Verified organization
                </span>
              ) : (
                <button
                  onClick={() => setVerifyOpen(true)}
                  className="mono rounded-md border border-risk-medium/30 px-2 py-1 text-[11px] uppercase tracking-wider text-risk-medium transition hover:bg-risk-medium/10"
                >
                  Unverified — verify ownership
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {scan.status === "done" && (
            <button onClick={() => setAttacker(true)} className="mono rounded-md border border-signal/30 bg-signal/10 px-3 py-1.5 text-xs text-signal hover:bg-signal/20">
              Attacker View
            </button>
          )}
          <Link href="/" className="mono text-xs text-ink-soft hover:text-ink">New scan</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[300px_1fr_390px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Console (desktop rail; on mobile the live logs are summarized in-graph) */}
        <aside className="hidden border-r border-line bg-base-900/60 lg:block">
          <ScanConsole stages={scan.stages} logs={scan.logs} scanning={scan.status === "scanning"} />
        </aside>

        {/* Graph */}
        <main className="relative min-h-[320px] flex-1 lg:min-h-0">
          <div className="grid-backdrop pointer-events-none absolute inset-0" />
          <AssetGraph
            assets={scan.assets}
            edges={scan.edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusPulseId={scan.status === "scanning" ? scan.latestAssetId : null}
            controls
          />
          {scan.assets.length === 0 && scan.status !== "error" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-14 w-14 animate-pulse-ring rounded-full border border-signal/40" />
                <p className="mono mt-4 text-sm text-ink-soft">Resolving root domain…</p>
              </div>
            </div>
          )}
          {scan.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="panel max-w-md p-6 text-center">
                <div className="mono text-xs uppercase tracking-wider text-risk-high">Scan error</div>
                <p className="mt-2 text-sm text-ink-soft">{scan.error}</p>
                <button onClick={scan.restart} className="mono mt-4 rounded-md border border-line px-3 py-1.5 text-xs text-ink hover:bg-base-700">
                  Retry
                </button>
              </div>
            </div>
          )}
          <GraphLegend />
        </main>

        {/* Right rail — stacks below the graph on mobile so findings stay reachable */}
        <aside className="block h-[46vh] shrink-0 border-t border-line bg-base-900/60 lg:h-auto lg:border-l lg:border-t-0">
          {selected ? (
            <NodeDetail asset={selected} onClose={() => setSelectedId(null)} />
          ) : scan.result ? (
            <Summary result={scan.result} onSelectAsset={setSelectedId} onOpenAttacker={() => setAttacker(true)} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="mono text-xs text-ink-faint">Assets and findings will appear here as the external surface is mapped.</p>
            </div>
          )}
        </aside>
      </div>

      {attacker && scan.result && <AttackerView result={scan.result} onClose={() => setAttacker(false)} />}
      {verifyOpen && resultTarget && (
        <VerifyPanel
          domain={resultTarget}
          onVerified={() => {
            setVerifyStatus("verified");
            setVerifyOpen(false);
          }}
          onClose={() => setVerifyOpen(false)}
        />
      )}
    </div>
  );
}

function GraphLegend() {
  const items = [
    { c: "#e8edf6", l: "Root" },
    { c: "#ff5b6e", l: "Critical" },
    { c: "#ff8a5b", l: "High" },
    { c: "#f5c451", l: "Medium" },
    { c: "#5b8cff", l: "Low" },
    { c: "#38e1c3", l: "Info" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-base-900/70 px-3 py-2 backdrop-blur">
      {items.map((i) => (
        <span key={i.l} className="mono flex items-center gap-1.5 text-[10px] text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: i.c, boxShadow: `0 0 8px ${i.c}88` }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-ink-soft">Loading…</div>}>
      <ScanView />
    </Suspense>
  );
}
