import type { ScanStage } from "@/lib/types";

export const SCAN_STAGES: ReadonlyArray<{ stage: ScanStage; label: string }> = [
  { stage: "init", label: "Initializing external view" },
  { stage: "certificates", label: "Reviewing certificate evidence" },
  { stage: "dns", label: "Inspecting public DNS relationships" },
  { stage: "correlate", label: "Correlating observed hostnames" },
  { stage: "http", label: "Checking public web reachability" },
  { stage: "normalize", label: "Normalizing discovered assets" },
  { stage: "graph", label: "Building organization graph" },
  { stage: "classify", label: "Classifying exposure signals" },
  { stage: "score", label: "Calculating protection posture" },
  { stage: "done", label: "Preparing external view" },
];

export const SCAN_STAGE_LABELS: Readonly<Record<ScanStage, string>> = Object.fromEntries(
  SCAN_STAGES.map(({ stage, label }) => [stage, label]),
) as Record<ScanStage, string>;
