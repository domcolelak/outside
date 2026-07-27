/**
 * The one connection-test service every provider route uses. It centralises the
 * rules that must hold for ALL providers: a credential is validated live before
 * it is ever stored, every provider call is metered, and every lifecycle change
 * is audited. Provider-specific behaviour is delegated to the ProviderDefinition.
 */

import { saveProviderKey, getConnectionSummary, getConnectionToken, deleteConnection } from "@/lib/integrations/connections";
import type { ProviderDefinition, ProviderStatus, ProviderErrorCode } from "./types";
import { recordProviderUsage, providerUsageSummary } from "./telemetry";
import { recordProviderAudit } from "./audit";

/** Live status of a stored credential — validates it against the provider. */
export async function providerStatus(def: ProviderDefinition, orgId: string): Promise<ProviderStatus> {
  if (def.commercialGate) {
    return { provider: def.id, stored: false, connected: false, blocked: { reason: def.commercialGate.reason } };
  }
  const summary = await getConnectionSummary(orgId, def.id);
  if (!summary) return { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };

  const token = await getConnectionToken(orgId, def.id);
  if (!token) return { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };

  const started = Date.now();
  const v = await def.validate(token);
  await recordProviderUsage({
    orgId,
    provider: def.id,
    operation: "status",
    ok: v.ok,
    status: v.ok ? 200 : v.status,
    errorCode: v.ok ? undefined : v.code,
    latencyMs: Date.now() - started,
  });
  const usage = await providerUsageSummary(orgId, def.id);

  if (!v.ok) {
    return { provider: def.id, stored: true, connected: false, accountHint: summary.accountHint, usage, error: { code: v.code, message: v.message, retryAfterSeconds: v.retryAfterSeconds } };
  }
  return {
    provider: def.id,
    stored: true,
    connected: true,
    accountHint: summary.accountHint,
    accountLabel: v.accountLabel,
    connectedAt: summary.connectedAt,
    capabilities: v.capabilities,
    usage,
  };
}

export type ConnectResult =
  | { ok: true; status: ProviderStatus }
  | { ok: false; httpStatus: number; error: string; code?: ProviderErrorCode };

/**
 * Connect or replace a credential. It is validated live first and stored ONLY on
 * success — a rejected credential never touches the store. Format, validation and
 * outcome are all metered and audited.
 */
export async function connectProvider(def: ProviderDefinition, orgId: string, rawKey: string, actorId: string): Promise<ConnectResult> {
  if (def.commercialGate) {
    return { ok: false, httpStatus: 403, error: def.commercialGate.reason };
  }
  if (!def.looksValid(rawKey)) {
    await recordProviderUsage({ orgId, provider: def.id, operation: "validate", ok: false, errorCode: "bad_format" });
    return { ok: false, httpStatus: 400, error: def.formatHint, code: "bad_format" };
  }

  const wasStored = !!(await getConnectionSummary(orgId, def.id));
  const started = Date.now();
  const v = await def.validate(rawKey);
  await recordProviderUsage({
    orgId,
    provider: def.id,
    operation: "validate",
    ok: v.ok,
    status: v.ok ? 200 : v.status,
    errorCode: v.ok ? undefined : v.code,
    latencyMs: Date.now() - started,
  });
  await recordProviderAudit({ orgId, provider: def.id, action: "validated", actorId, detail: v.ok ? v.accountLabel : v.code });

  if (!v.ok) {
    return { ok: false, httpStatus: 400, error: v.message, code: v.code };
  }

  await saveProviderKey(orgId, def.id, rawKey, actorId);
  await recordProviderUsage({ orgId, provider: def.id, operation: wasStored ? "replace" : "connect", ok: true });
  await recordProviderAudit({ orgId, provider: def.id, action: wasStored ? "replaced" : "connected", actorId, detail: v.accountLabel });

  return { ok: true, status: await providerStatus(def, orgId) };
}

/** Remove a stored credential and audit it. */
export async function disconnectProvider(def: ProviderDefinition, orgId: string, actorId: string): Promise<ProviderStatus> {
  await deleteConnection(orgId, def.id);
  await recordProviderUsage({ orgId, provider: def.id, operation: "disconnect", ok: true });
  await recordProviderAudit({ orgId, provider: def.id, action: "disconnected", actorId });
  return { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };
}
