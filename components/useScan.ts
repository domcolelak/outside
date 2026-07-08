"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, Edge, ScanEvent, ScanResult, ScanStage } from "@/lib/types";

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

const STAGE_ORDER: Array<{ stage: ScanStage; label: string }> = [
  { stage: "init", label: "Initializing external view" },
  { stage: "certificates", label: "Reviewing certificate evidence" },
  { stage: "dns", label: "Inspecting public DNS relationships" },
  { stage: "correlate", label: "Correlating observed hostnames" },
  { stage: "classify", label: "Classifying exposure signals" },
  { stage: "score", label: "Calculating exposure score" },
];

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
    stages: STAGE_ORDER.map((s) => ({ ...s, status: "pending" })),
    result: null,
    error: null,
    latestAssetId: null,
  });
  const esRef = useRef<EventSource | null>(null);

  const start = useCallback(() => {
    if (!target) return;
    esRef.current?.close();
    setState({
      status: "scanning",
      assets: [],
      edges: [],
      logs: [],
      stages: STAGE_ORDER.map((s) => ({ ...s, status: "pending" })),
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
            if (prev.assets.some((a) => a.id === event.asset.id)) return prev;
            return { ...prev, assets: [...prev.assets, event.asset], latestAssetId: event.asset.id };
          case "edge":
            if (prev.edges.some((x) => x.id === event.edge.id)) return prev;
            return { ...prev, edges: [...prev.edges, event.edge] };
          case "log":
            return { ...prev, logs: [...prev.logs, { ...event, ts: Date.now() }] };
          case "stage": {
            const stages = prev.stages.map((s) =>
              s.stage === event.stage
                ? { ...s, status: (event.status === "done" ? "done" : "active") as StageState["status"] }
                : s,
            );
            return { ...prev, stages };
          }
          case "result":
            return { ...prev, result: event.result, status: "done", assets: event.result.graph.assets, edges: event.result.graph.edges };
          case "error":
            return { ...prev, status: "error", error: event.message };
          default:
            return prev;
        }
      });
      if (event.type === "result" || event.type === "error") {
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
