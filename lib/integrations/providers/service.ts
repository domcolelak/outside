/**
 * The one connection-test service every provider route uses. It centralises the
 * rules that must hold for ALL providers: a credential is validated live before
 * it is ever stored, every provider call is metered, and every lifecycle change
 * is audited. Provider-specific behaviour is delegated to the ProviderDefinition.
 */

import {
  saveProviderKey,
  getConnectionSummary,
  getConnectionToken,
  updateConnectionMetadata,
  deleteConnection,
  type ConnectionMetadata,
  type ConnectionSummary,
} from "@/lib/integrations/connections";
import type { ProviderDefinition, ProviderStatus, ProviderErrorCode } from "./types";
import { recordProviderUsage, providerUsageSummary } from "./telemetry";
import { recordProviderAudit } from "./audit";

async function statusFromSummary(def: ProviderDefinition, orgId: string, summary: ConnectionSummary): Promise<ProviderStatus> {
  const usage = await providerUsageSummary(orgId, def.id);
  const validationError = summary.metadata.validationError;
  const hasValidation = typeof summary.metadata.lastValidatedAt === "string";
  return {
    provider: def.id,
    stored: true,
    connected: hasValidation && !validationError,
    accountHint: summary.accountHint,
    accountLabel: summary.metadata.accountLabel,
    connectedAt: summary.connectedAt,
    lastValidatedAt: summary.metadata.lastValidatedAt,
    capabilities: summary.metadata.capabilities,
    usage,
    ...(!hasValidation
      ? { error: { code: "unknown" as const, message: "Run a one-time connection test to confirm this saved key." } }
      : validationError
        ? {
            error: {
              code: validationError.code as ProviderErrorCode,
              message: validationError.message,
              retryAfterSeconds: validationError.retryAfterSeconds,
            },
          }
        : {}),
  };
}

/**
 * Return the cached validation snapshot by default. Only an explicit refresh
 * contacts the provider, so opening the page never consumes customer quota.
 */
export async function providerStatus(
  def: ProviderDefinition,
  orgId: string,
  options: { refresh?: boolean } = {},
): Promise<ProviderStatus> {
  if (def.commercialGate) {
    return { provider: def.id, stored: false, connected: false, blocked: { reason: def.commercialGate.reason } };
  }
  const summary = await getConnectionSummary(orgId, def.id);
  if (!summary) return { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };
  if (!options.refresh) return statusFromSummary(def, orgId, summary);

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
  const at = new Date().toISOString();
  const metadata: ConnectionMetadata = v.ok
    ? {
        accountLabel: v.accountLabel,
        capabilities: v.capabilities,
        lastValidatedAt: at,
      }
    : {
        ...summary.metadata,
        lastValidatedAt: at,
        validationError: {
          code: v.code,
          message: v.message,
          retryAfterSeconds: v.retryAfterSeconds,
          at,
        },
      };
  await updateConnectionMetadata(orgId, def.id, metadata);
  const refreshed = await getConnectionSummary(orgId, def.id);
  return refreshed
    ? statusFromSummary(def, orgId, refreshed)
    : { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };
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

  const previousSummary = await getConnectionSummary(orgId, def.id);
  const wasStored = !!previousSummary;
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

  const previousToken = wasStored ? await getConnectionToken(orgId, def.id) : null;
  await saveProviderKey(orgId, def.id, rawKey, actorId, {
    accountLabel: v.accountLabel,
    capabilities: v.capabilities,
    lastValidatedAt: new Date().toISOString(),
  });
  await recordProviderUsage({ orgId, provider: def.id, operation: wasStored ? "replace" : "connect", ok: true });
  try {
    await recordProviderAudit({ orgId, provider: def.id, action: wasStored ? "replaced" : "connected", actorId, detail: v.accountLabel });
  } catch (error) {
    if (previousToken && previousSummary) {
      await saveProviderKey(orgId, def.id, previousToken, actorId, previousSummary.metadata);
    } else {
      await deleteConnection(orgId, def.id);
    }
    throw error;
  }

  return { ok: true, status: await providerStatus(def, orgId) };
}

/** Remove a stored credential and audit it. */
export async function disconnectProvider(def: ProviderDefinition, orgId: string, actorId: string): Promise<ProviderStatus> {
  const previousSummary = await getConnectionSummary(orgId, def.id);
  const previousToken = previousSummary ? await getConnectionToken(orgId, def.id) : null;
  await deleteConnection(orgId, def.id);
  await recordProviderUsage({ orgId, provider: def.id, operation: "disconnect", ok: true });
  try {
    await recordProviderAudit({ orgId, provider: def.id, action: "disconnected", actorId });
  } catch (error) {
    if (previousSummary && previousToken) {
      await saveProviderKey(orgId, def.id, previousToken, actorId, previousSummary.metadata);
    }
    throw error;
  }
  return { provider: def.id, stored: false, connected: false, usage: await providerUsageSummary(orgId, def.id) };
}
