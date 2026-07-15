import type { Priority } from "@/lib/types";

export type GuardianChecklistCode =
  | "spf"
  | "dkim"
  | "dmarc"
  | "dnssec"
  | "hsts"
  | "https"
  | "security_txt"
  | "mta_sts"
  | "tls"
  | "email_security";

export type GuardianChecklistState = "pass" | "warning" | "fail" | "unknown";

export interface GuardianEvidence {
  source: string;
  observation: string;
  observedAt: string;
  scanId: string;
  asset?: string;
}

export interface GuardianChecklistItem {
  code: GuardianChecklistCode;
  label: string;
  state: GuardianChecklistState;
  evidence: GuardianEvidence[];
  explanation: string;
  whyItMatters: string;
  recommendedAction: string;
}

export interface GuardianInventoryItem {
  canonical: string;
  label: string;
  kind: string;
  priority: Priority;
  addresses: string[];
  cnames?: string[];
  technologies: string[];
  status?: string;
  certKey?: string;
  certNotAfter?: string;
  certDaysToExpiry?: number;
  redirectLocation?: string;
  mx: string[];
  spf?: string;
  dkim?: string;
  dmarc?: string;
  dnssec?: string;
  mtaSts?: string;
  mailProvider?: string;
  securityTxt?: string;
  dnsProvider?: string;
  cloudProvider?: string;
  cdn?: string;
  providerEvidence?: string[];
  domainExpiresAt?: string;
  domainDaysToExpiry?: number;
  isShadow: boolean;
  isNonProduction: boolean;
  isAuthSurface: boolean;
  isApiSurface: boolean;
}

export interface GuardianMetrics {
  assets: number;
  webSurfaces: number;
  shadowAssets: number;
  authSurfaces: number;
  apiSurfaces: number;
  nonProduction: number;
  technologies: number;
  infrastructureProviders: number;
  cloudAssets: number;
  cdnFrontedAssets: number;
  expiringCertificates: number;
  checklistPassed: number;
  checklistActionable: number;
  complexityIndex: number;
}

export interface GuardianSnapshot {
  orgId: string;
  target: string;
  scanId: string;
  observedAt: string;
  exposureScore: number;
  metrics: GuardianMetrics;
  inventory: GuardianInventoryItem[];
  checklist: GuardianChecklistItem[];
}

export type GuardianEventType =
  | "asset_new"
  | "asset_returned"
  | "asset_removed"
  | "dns_changed"
  | "certificate_changed"
  | "certificate_expiring"
  | "domain_expiring"
  | "mail_security_changed"
  | "auth_surface_new"
  | "api_surface_new"
  | "nonproduction_reachable"
  | "technology_changed"
  | "redirect_changed"
  | "infrastructure_changed"
  | "shadow_appeared"
  | "shadow_disappeared"
  | "asset_flapping"
  | "surface_growth"
  | "checklist_changed";

export type GuardianEventCategory = "surface" | "identity" | "mail" | "infrastructure" | "certificate" | "posture";

export interface GuardianEvent {
  id: string;
  orgId: string;
  target: string;
  scanId: string;
  type: GuardianEventType;
  category: GuardianEventCategory;
  severity: Priority;
  confidence: number;
  title: string;
  summary: string;
  why: string;
  affectedAssets: string[];
  evidence: GuardianEvidence[];
  groupKey: string;
  observedAt: string;
}

export type DriftDirection = "improving" | "stable" | "watch" | "worsening";

export interface GuardianDriftDimension {
  code: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: DriftDirection;
  explanation: string;
}

export interface GuardianDrift {
  from: string | null;
  to: string;
  direction: DriftDirection;
  headline: string;
  narrative: string;
  dimensions: GuardianDriftDimension[];
}

export type GuardianRecommendationStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "dismissed";
export type GuardianGuidePlatform = "Generic" | "Cloudflare" | "AWS" | "Azure" | "Google Cloud" | "Google Workspace" | "Microsoft 365" | "Vercel" | "Netlify" | "GitHub Pages";

export interface GuardianRemediationGuide {
  platform: GuardianGuidePlatform;
  title: string;
  steps: string[];
  verification: string;
}

export interface GuardianRecommendation {
  id: string;
  orgId: string;
  target: string;
  code: string;
  status: GuardianRecommendationStatus;
  priority: Priority;
  confidence: number;
  title: string;
  why: string;
  reasoning: string;
  affectedAssets: string[];
  evidence: GuardianEvidence[];
  suggestedReview: string;
  businessImpact: string;
  guides: GuardianRemediationGuide[];
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface GuardianAnalysis {
  snapshot: GuardianSnapshot;
  events: GuardianEvent[];
  drift: GuardianDrift;
  recommendations: GuardianRecommendation[];
}

export type GuardianChannelType = "slack" | "microsoft_teams" | "discord" | "webhook" | "jira" | "github_issues" | "linear";

export interface GuardianChannel {
  id: string;
  orgId: string;
  type: GuardianChannelType;
  name: string;
  enabled: boolean;
  destinationHint: string;
  createdAt: string;
}

export interface GuardianDelivery {
  id: string;
  orgId: string;
  channelId: string | null;
  channelType: GuardianChannelType | "email";
  target: string;
  kind: "event_group" | "weekly_digest";
  status: "pending" | "sending" | "retry" | "sent" | "failed";
  itemCount: number;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface GuardianQueueMetrics {
  pending: number;
  retry: number;
  sending: number;
  oldestReadyAgeSeconds: number;
}

export interface GuardianActivity {
  id: string;
  orgId: string;
  target: string;
  type: "scan_analyzed" | "events_correlated" | "notification_queued" | "digest_generated" | "recommendation_updated";
  message: string;
  createdAt: string;
}

export interface GuardianDigest {
  orgId: string;
  target: string;
  weekOf: string;
  generatedAt: string;
  headline: string;
  executiveSummary: string;
  newAssets: number;
  removedAssets: number;
  importantChanges: number;
  checklistImprovements: number;
  checklistRegressions: number;
  openRecommendations: number;
  shadowAssets: number;
  drift: GuardianDrift;
  reviewItems: Array<{ title: string; detail: string; severity: Priority }>;
}

export interface GuardianTargetView {
  target: string;
  latest: GuardianSnapshot;
  history: GuardianSnapshot[];
  drift: GuardianDrift;
  events: GuardianEvent[];
  recommendations: GuardianRecommendation[];
}

export interface GuardianOverview {
  orgId: string;
  generatedAt: string;
  targets: GuardianTargetView[];
  recentEvents: GuardianEvent[];
  recommendations: GuardianRecommendation[];
  deliveries: GuardianDelivery[];
  activity: GuardianActivity[];
  channels: GuardianChannel[];
  durable: boolean;
}
