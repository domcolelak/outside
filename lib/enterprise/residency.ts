import type { DataRegion, EnterpriseWorkspace } from "./types";
const REGIONS = new Set<DataRegion>(["eu", "us", "uk", "ca", "au", "apac"]);
export function runtimeDataRegion(): DataRegion | null { const value = process.env.OUTSIDE_DATA_REGION as DataRegion | undefined; return value && REGIONS.has(value) ? value : null; }
export function workspaceInRegion(workspace: EnterpriseWorkspace): boolean { const runtime = runtimeDataRegion(); return !runtime || workspace.dataRegion === runtime; }
export function assertWorkspaceRegion(workspace: EnterpriseWorkspace): void { const runtime = runtimeDataRegion(); if (runtime && workspace.dataRegion !== runtime) throw new Error(`Workspace data belongs in ${workspace.dataRegion}; this deployment serves ${runtime}.`); }
