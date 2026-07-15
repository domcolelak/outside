import type { GuardianActivity, GuardianAnalysis, GuardianChannel, GuardianChannelType, GuardianDelivery, GuardianDigest, GuardianEvent, GuardianEvidenceIntelligence, GuardianEvidenceSnapshot, GuardianOverview, GuardianQueueMetrics, GuardianRecommendation, GuardianRecommendationStatus, GuardianSnapshot } from "./types";

export interface GuardianChannelRecord extends GuardianChannel {
  encryptedConfig: string;
}

export interface GuardianDeliveryJob extends GuardianDelivery {
  payload: unknown;
  leaseId: string;
  encryptedConfig: string | null;
}

export interface CreateChannelInput {
  orgId: string;
  type: GuardianChannelType;
  name: string;
  destinationHint: string;
  encryptedConfig: string;
}

export interface QueueDeliveryInput {
  idempotencyKey: string;
  orgId: string;
  channelId: string | null;
  channelType: GuardianChannelType | "email";
  target: string;
  kind: GuardianDelivery["kind"];
  itemCount: number;
  payload: unknown;
}

export interface GuardianStore {
  readonly durable: boolean;
  history(orgId: string, target: string, limit?: number): Promise<GuardianSnapshot[]>;
  events(orgId: string, target?: string, limit?: number): Promise<GuardianEvent[]>;
  recommendations(orgId: string, target?: string): Promise<GuardianRecommendation[]>;
  evidenceSnapshots(orgId: string, target: string, limit?: number): Promise<GuardianEvidenceSnapshot[]>;
  evidenceIntelligence(orgId: string, target: string, findingId?: string): Promise<GuardianEvidenceIntelligence | null>;
  saveAnalysis(analysis: GuardianAnalysis): Promise<void>;
  updateRecommendation(orgId: string, id: string, status: GuardianRecommendationStatus, actor: string): Promise<boolean>;
  overview(orgId: string): Promise<GuardianOverview>;
  channels(orgId: string, includeSecrets?: boolean): Promise<Array<GuardianChannel | GuardianChannelRecord>>;
  createChannel(input: CreateChannelInput): Promise<GuardianChannel>;
  setChannelEnabled(orgId: string, id: string, enabled: boolean): Promise<boolean>;
  deleteChannel(orgId: string, id: string): Promise<boolean>;
  queueDelivery(input: QueueDeliveryInput): Promise<GuardianDelivery>;
  queueMetrics(now: Date): Promise<GuardianQueueMetrics>;
  claimDeliveries(now: Date, limit: number, leaseMs: number): Promise<GuardianDeliveryJob[]>;
  completeDelivery(id: string, leaseId: string, at: Date): Promise<boolean>;
  failDelivery(id: string, leaseId: string, error: string, retryAt: Date): Promise<boolean>;
  saveDigest(digest: GuardianDigest): Promise<boolean>;
  digests(orgId: string, target?: string, limit?: number): Promise<GuardianDigest[]>;
  activity(orgId: string, limit?: number): Promise<GuardianActivity[]>;
}
