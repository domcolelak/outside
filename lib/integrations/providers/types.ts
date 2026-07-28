/**
 * Shared provider-integration framework.
 *
 * Every external provider (breach intel, DNS intel, scanners, notifiers…) is
 * described by a ProviderDefinition and plugs into ONE credential store, ONE
 * connection-test service, ONE telemetry stream and ONE audit trail. Provider-
 * specific logic lives only in the adapter behind `looksValid` / `validate`.
 */

import type { IntegrationProvider } from "@/lib/integrations/connections";

/**
 * Normalized error taxonomy. Every adapter maps its transport/status errors to
 * one of these so the UI, telemetry and quota logic are provider-agnostic.
 */
export type ProviderErrorCode =
  | "bad_format" // credential fails the local format check — no network call made
  | "invalid_key" // provider rejected the credential (typically 401)
  | "forbidden" // authenticated but not allowed — plan, scope or unverified target (403)
  | "rate_limited" // provider throttled the request (429)
  | "unavailable" // provider is down or timed out (5xx / network timeout)
  | "network" // could not reach the provider at all
  | "unknown"; // an unexpected/unmapped response

/** A discrete capability the connected credential does or does not unlock. */
export interface ProviderCapability {
  id: string;
  label: string;
  available: boolean;
  /** Non-secret human detail, e.g. "3 verified domains". */
  detail?: string;
}

export interface ProviderValidationOk {
  ok: true;
  /** Non-secret label for the connected account, e.g. a subscription name. */
  accountLabel: string;
  capabilities: ProviderCapability[];
}
export interface ProviderValidationError {
  ok: false;
  code: ProviderErrorCode;
  /** Safe to show a user — never contains the credential or a raw payload. */
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}
export type ProviderValidation = ProviderValidationOk | ProviderValidationError;

export type CredentialKind = "api_key";

/**
 * Declarative description of a provider. Adding a provider is: write an adapter,
 * add one ProviderDefinition here, register it — no new store, route or UI.
 */
export interface ProviderDefinition {
  /** Must also be a member of the shared credential store's provider union. */
  id: IntegrationProvider;
  name: string;
  category: "threat_intel" | "attack_surface" | "reputation" | "ai" | "notifier";
  summary: string;
  credentialKind: CredentialKind;
  /**
   * The environment variable this credential substitutes inside a scan. The
   * scan pipeline reads keys through providerKey(envKey), so an organization's
   * stored credential transparently takes precedence over the platform key.
   */
  envKey: string;
  /**
   * The name this provider reports itself as in a scan's ProviderRun list, used
   * to attribute post-scan usage back to the organization's credential.
   */
  runLabel: string;
  /** Where a customer obtains the credential. */
  docsUrl: string;
  /** Placeholder shown in the key field. */
  keyPlaceholder: string;
  /** Cheap local shape check, run before any network call. */
  looksValid(raw: string): boolean;
  /** The message shown when `looksValid` fails. */
  formatHint: string;
  /**
   * Live credential validation — the ONLY signal a connection is real. A stored
   * credential is never shown "connected" until this succeeds.
   */
  validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation>;
  /**
   * Optional commercial/legal gate. When set, connecting is blocked with this
   * reason until the provider is cleared for production use.
   */
  commercialGate?: { reason: string };
}

/** Non-secret connection status sent to the browser. */
export interface ProviderStatus {
  provider: IntegrationProvider;
  stored: boolean;
  connected: boolean;
  accountHint?: string;
  accountLabel?: string;
  connectedAt?: string;
  capabilities?: ProviderCapability[];
  usage?: { total: number; failures: number; lastUsedAt?: string; lastErrorCode?: string };
  blocked?: { reason: string };
  error?: { code: ProviderErrorCode; message: string; retryAfterSeconds?: number };
}

/** Public, non-secret descriptor the UI needs to render a connector. */
export interface ProviderDescriptor {
  id: IntegrationProvider;
  name: string;
  category: ProviderDefinition["category"];
  summary: string;
  docsUrl: string;
  keyPlaceholder: string;
  blocked?: { reason: string };
}

export function toDescriptor(def: ProviderDefinition): ProviderDescriptor {
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    summary: def.summary,
    docsUrl: def.docsUrl,
    keyPlaceholder: def.keyPlaceholder,
    blocked: def.commercialGate ? { reason: def.commercialGate.reason } : undefined,
  };
}
