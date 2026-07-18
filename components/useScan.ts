"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, Edge, ScanEvent, ScanResult, ScanStage } from "@/lib/types";
import { SCAN_STAGES } from "@/lib/discovery/stages";
import { trackFunnel } from "@/lib/analytics/client";

export interface LogLine {
  level: "info" | "add" | "signal" | "warn";
  message: string;
  ts: number;
}

export interface StageState {
  stage: ScanStage;
  label: string;
  status: "pending" | "active" | "done";
}

export interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  assets: Asset[];
  edges: Edge[];
  logs: LogLine[];
  stages: StageState[];
  result: ScanResult | null;
  error: string | null;
  latestAssetId: string | null;
}

export function useScan(target: string | null, mode: "auto" | "demo") {
  const [state, setState] = useState<ScanState>({
    status: "idle",
    assets: [],
    edges: [],
    logs: [],
    stages: SCAN_STAGES.map((s) => ({ ...s, status: "pending" })),
    result: null,
    error: null,
    latestAssetId: null,
  });
  const esRef = useRef<EventSource | null>(null);
  const assetIdsRef = useRef(new Set<string>());
  const edgeIdsRef = useRef(new Set<string>());

  const start = useCallback(() => {
    if (!target) return;
    esRef.current?.close();
    assetIdsRef.current.clear();
    edgeIdsRef.current.clear();
    setState({
      status: "scanning",
      assets: [],
      edges: [],
      logs: [],
      stages: SCAN_STAGES.map((s) => ({ ...s, status: "pending" })),
      result: null,
      error: null,
      latestAssetId: null,
    });

    const es = new EventSource(`/api/scan?target=${encodeURIComponent(target)}&mode=${mode}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as ScanEvent;
      setState((prev) => {
        switch (event.type) {
          case "asset":
            if (assetIdsRef.current.has(event.asset.id)) return prev;
            assetIdsRef.current.add(event.asset.id);
            return { ...prev, assets: [...prev.assets, event.asset], latestAssetId: event.asset.id };
          case "edge":
            if (edgeIdsRef.current.has(event.edge.id)) return prev;
            edgeIdsRef.current.add(event.edge.id);
            return { ...prev, edges: [...prev.edges, event.edge] };
          case "log":
            return { ...prev, logs: [...prev.logs.slice(-499), { ...event, ts: Date.now() }] };
          case "stage": {
            const stages = prev.stages.map((s) =>
              s.stage === event.stage
                ? { ...s, status: (event.status === "done" ? "done" : "active") as StageState["status"] }
                : s,
            );
            return { ...prev, stages };
          }
          case "result":
            assetIdsRef.current = new Set(event.result.graph.assets.map((asset) => asset.id));
            edgeIdsRef.current = new Set(event.result.graph.edges.map((edge) => edge.id));
            return {
              ...prev,
              result: event.result,
              status: "done",
              assets: event.result.graph.assets,
              edges: event.result.graph.edges,
              stages: prev.stages.map((stage) => ({ ...stage, status: "done" })),
            };
          case "error":
            return { ...prev, status: "error", error: event.message };
          default:
            return prev;
        }
      });
      if (event.type === "result" || event.type === "error") {
        trackFunnel(event.type === "result" ? (event.result.isDemo ? "demo_completed" : "scan_completed") : "scan_failed", mode === "demo" ? "demo" : "real");
        es.close();
      }
    };

    es.onerror = () => {
      setState((prev) => (prev.status === "done" ? prev : { ...prev, status: prev.result ? "done" : "error", error: prev.error ?? (prev.result ? null : "Connection interrupted.") }));
      es.close();
    };
  }, [target, mode]);

  useEffect(() => {
    start();
    return () => esRef.current?.close();
  }, [start]);

  return { ...state, restart: start };
}
