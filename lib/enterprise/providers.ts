import type { IntegrationCategory } from "./types";

export const ENTERPRISE_PROVIDERS = {
  splunk: { category: "siem", label: "Splunk", required: ["url", "hecToken"], format: "splunk-hec" },
  microsoft_sentinel: { category: "siem", label: "Microsoft Sentinel", required: ["url", "customerId", "sharedKey", "logType"], format: "sentinel" },
  elastic: { category: "siem", label: "Elastic Security", required: ["url", "apiKey"], format: "ecs" },
  qradar: { category: "siem", label: "IBM QRadar", required: ["url", "token"], format: "leef" },
  chronicle: { category: "siem", label: "Google Chronicle", required: ["url", "token"], format: "udm" },
  cortex_xsoar: { category: "soar", label: "Cortex XSOAR", required: ["url", "apiKey"], format: "xsoar" },
  servicenow: { category: "ticketing", label: "ServiceNow", required: ["url", "username", "password"], format: "ticket" },
  freshservice: { category: "ticketing", label: "Freshservice", required: ["url", "apiKey"], format: "ticket" },
  jira_service_management: { category: "ticketing", label: "Jira Service Management", required: ["url", "email", "apiToken", "projectKey"], format: "ticket" },
  pagerduty: { category: "ticketing", label: "PagerDuty", required: ["url", "routingKey"], format: "event" },
  opsgenie: { category: "ticketing", label: "Opsgenie", required: ["url", "apiKey"], format: "alert" },
  webhook: { category: "webhook", label: "Signed webhook", required: ["url", "signingSecret"], format: "outside-v1" },
} as const satisfies Record<string, { category: IntegrationCategory; label: string; required: readonly string[]; format: string }>;

export type EnterpriseProvider = keyof typeof ENTERPRISE_PROVIDERS;
export function validateProviderConfig(provider: string, value: unknown): { ok: true; config: Record<string, string> } | { ok: false; error: string } {
  const definition = ENTERPRISE_PROVIDERS[provider as EnterpriseProvider]; if (!definition) return { ok: false, error: "Unsupported enterprise integration provider." };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Integration configuration is required." };
  const config: Record<string, string> = {}; for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (typeof item === "string" && item.trim()) config[key] = item.trim();
  for (const field of definition.required) if (!config[field]) return { ok: false, error: `${definition.label} requires ${field}.` };
  try { const url = new URL(config.url!); if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error(); } catch { return { ok: false, error: "Integration URL must be a credential-free HTTPS URL on port 443." }; }
  return { ok: true, config };
}

export interface EnterpriseEventEnvelope { id: string; occurredAt: string; organizationId: string; type: string; severity: string; title: string; description: string; resource: { type: string; id: string; name?: string }; evidence: Record<string, unknown>; }
export function providerPayload(provider: EnterpriseProvider, event: EnterpriseEventEnvelope): Record<string, unknown> {
  const common = { event: { id: event.id, kind: event.type, severity: event.severity, created: event.occurredAt }, organization: { id: event.organizationId }, resource: event.resource, message: event.title, description: event.description, outside: { schema: "com.outside.enterprise.event/v1", evidence: event.evidence } };
  if (provider === "splunk") return { time: Date.parse(event.occurredAt) / 1000, event: common, sourcetype: "outside:enterprise" };
  if (provider === "microsoft_sentinel") return { TimeGenerated: event.occurredAt, OutsideEventId: event.id, EventType: event.type, Severity: event.severity, Title: event.title, Description: event.description, ResourceType: event.resource.type, ResourceId: event.resource.id, Evidence: JSON.stringify(event.evidence) };
  if (provider === "elastic") return { "@timestamp": event.occurredAt, ecs: { version: "8.11.0" }, ...common };
  if (provider === "qradar") return { leef: `LEEF:2.0|OUTSIDE|Enterprise|1|${event.type}|sev=${event.severity}\tmsg=${event.title.replace(/[\t\r\n]/g, " ")}\tresource=${event.resource.id}` };
  if (provider === "chronicle") return { log_type: "OUTSIDE_ENTERPRISE", entries: [{ log_text: JSON.stringify(common), ts_rfc3339: event.occurredAt }] };
  if (provider === "cortex_xsoar") return { incident: { name: event.title, type: "OUTSIDE Enterprise", occurred: event.occurredAt, severity: event.severity, details: event.description, rawJSON: JSON.stringify(common), labels: [{ type: "outsideEventId", value: event.id }] } };
  if (provider === "pagerduty") return { routing_key: "__CONFIGURED_AT_DELIVERY__", event_action: "trigger", dedup_key: event.id, payload: { summary: event.title, source: event.resource.name ?? event.resource.id, severity: event.severity === "critical" ? "critical" : event.severity === "high" ? "error" : "warning", custom_details: common } };
  return common;
}
