/**
 * Customer-connected provider credentials.
 *
 * A connection is per organization and per provider. The token is encrypted at
 * rest with the same AES-256-GCM helper Guardian channels use, and is never
 * returned to the browser: callers either ask for a summary (safe to render) or
 * for the token itself, which only server-side remediation code does.
 */

import type { Prisma } from "@prisma/client";
import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import { encryptGuardianConfig, decryptGuardianConfig, decryptGuardianConfigDetailed } from "@/lib/guardian/crypto";
import { operationalLog } from "@/lib/observability/log";

export type IntegrationProvider = "cloudflare" | "hibp" | "securitytrails" | "shodan" | "abuseipdb" | "greynoise" | "virustotal" | "openai" | "censys" | "vercel";

export interface ConnectionZone {
  id: string;
  name: string;
}

export interface ConnectionMetadata {
  accountLabel?: string;
  capabilities?: Array<{ id: string; label: string; available: boolean; detail?: string }>;
  lastValidatedAt?: string;
  validationError?: { code: string; message: string; retryAfterSeconds?: number; at: string };
}

/** Safe to send to the browser — carries no secret material. */
export interface ConnectionSummary {
  provider: IntegrationProvider;
  /** A non-sensitive label for the connected account, e.g. "token ending 4f2a". */
  accountHint: string;
  zones: ConnectionZone[];
  metadata: ConnectionMetadata;
  connectedAt: string;
}

interface StoredConnection {
  orgId: string;
  provider: IntegrationProvider;
  encryptedToken: string;
  accountHint: string;
  zones: ConnectionZone[];
  metadata: ConnectionMetadata;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const g = globalThis as unknown as { __outsideIntegrationConnections?: Map<string, StoredConnection> };
function mem() {
  return (g.__outsideIntegrationConnections ??= new Map<string, StoredConnection>());
}
function key(orgId: string, provider: IntegrationProvider) {
  return JSON.stringify([orgId, provider]);
}
function associatedData(orgId: string, provider: IntegrationProvider) {
  return `outside.integration:${JSON.stringify([orgId, provider])}`;
}
function db() {
  return storageMode() === "database" ? database : null;
}

/** Never expose more than the last four characters of a credential. */
export function tokenHint(token: string): string {
  return `token ending ${token.slice(-4)}`;
}

/** UI mask for a raw API key: dots + last four, e.g. ••••••••4A7F. */
export function maskedKey(value: string): string {
  const trimmed = value.trim();
  return `${"•".repeat(Math.max(8, Math.min(28, trimmed.length - 4)))}${trimmed.slice(-4)}`;
}

/**
 * Store a raw provider API key (no zones/verify flow — unlike Cloudflare). Reuses
 * the same encrypted per-org store; the plaintext key is only ever read back by
 * getConnectionToken on the server.
 */
export async function saveProviderKey(
  orgId: string,
  provider: IntegrationProvider,
  value: string,
  createdBy: string,
  metadata: ConnectionMetadata = {},
): Promise<{ accountHint: string }> {
  const encryptedToken = encryptGuardianConfig(value, associatedData(orgId, provider));
  const accountHint = maskedKey(value);
  const conn = db();
  if (conn) {
    await conn.integrationConnection.upsert({
      where: { orgId_provider: { orgId, provider } },
      create: {
        orgId,
        provider,
        encryptedToken,
        accountHint,
        zones: [] as unknown as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
        createdBy,
      },
      update: { encryptedToken, accountHint, metadata: metadata as Prisma.InputJsonValue },
    });
  } else {
    mem().set(key(orgId, provider), {
      orgId,
      provider,
      encryptedToken,
      accountHint,
      zones: [],
      metadata,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return { accountHint };
}

export async function saveConnection(input: {
  orgId: string;
  provider: IntegrationProvider;
  token: string;
  zones: ConnectionZone[];
  createdBy: string;
}): Promise<ConnectionSummary> {
  const encryptedToken = encryptGuardianConfig(input.token, associatedData(input.orgId, input.provider));
  const accountHint = tokenHint(input.token);
  const conn = db();
  if (conn) {
    await conn.integrationConnection.upsert({
      where: { orgId_provider: { orgId: input.orgId, provider: input.provider } },
      create: {
        orgId: input.orgId,
        provider: input.provider,
        encryptedToken,
        accountHint,
        zones: input.zones as unknown as Prisma.InputJsonValue,
        metadata: {} as Prisma.InputJsonValue,
        createdBy: input.createdBy,
      },
      update: { encryptedToken, accountHint, zones: input.zones as unknown as Prisma.InputJsonValue },
    });
  } else {
    mem().set(key(input.orgId, input.provider), {
      orgId: input.orgId,
      provider: input.provider,
      encryptedToken,
      accountHint,
      zones: input.zones,
      metadata: {},
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return { provider: input.provider, accountHint, zones: input.zones, metadata: {}, connectedAt: new Date().toISOString() };
}

export async function getConnectionSummary(orgId: string, provider: IntegrationProvider): Promise<ConnectionSummary | null> {
  const conn = db();
  if (conn) {
    const row = await conn.integrationConnection.findUnique({ where: { orgId_provider: { orgId, provider } } });
    if (!row) return null;
    return {
      provider,
      accountHint: row.accountHint,
      zones: (row.zones as unknown as ConnectionZone[]) ?? [],
      metadata: (row.metadata as unknown as ConnectionMetadata) ?? {},
      connectedAt: row.createdAt.toISOString(),
    };
  }
  const row = mem().get(key(orgId, provider));
  return row ? { provider, accountHint: row.accountHint, zones: row.zones, metadata: row.metadata, connectedAt: row.createdAt } : null;
}

/** Update only the browser-safe validation snapshot; never touches the key. */
export async function updateConnectionMetadata(
  orgId: string,
  provider: IntegrationProvider,
  metadata: ConnectionMetadata,
): Promise<void> {
  const conn = db();
  if (conn) {
    await conn.integrationConnection.update({
      where: { orgId_provider: { orgId, provider } },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
    return;
  }
  const row = mem().get(key(orgId, provider));
  if (row) {
    row.metadata = metadata;
    row.updatedAt = new Date().toISOString();
  }
}

/**
 * The decrypted token. Server-side remediation only — never return this from a
 * route handler.
 */
export async function getConnectionToken(orgId: string, provider: IntegrationProvider): Promise<string | null> {
  const conn = db();
  if (conn) {
    const row = await conn.integrationConnection.findUnique({ where: { orgId_provider: { orgId, provider } } });
    if (!row) return null;
    const opened = decryptGuardianConfigDetailed<string>(row.encryptedToken, associatedData(orgId, provider));
    // Re-encrypt when the stored form is behind: an old ciphertext format, or a
    // credential still sealed under a retired key. Without the staleKey case a
    // rotation could never finish, because a v2 record encrypted under the old
    // key would keep opening from GUARDIAN_ENCRYPTION_KEY_PREVIOUS forever.
    if (opened.version === "v1" || opened.staleKey) {
      await conn.integrationConnection
        .update({
          where: { orgId_provider: { orgId, provider } },
          data: { encryptedToken: encryptGuardianConfig(opened.value, associatedData(orgId, provider)) },
        })
        .catch((error: unknown) => {
          // The read still succeeds; surface the failed migration so a rotation
          // that never completes is visible instead of silent.
          operationalLog("warn", "integrations.credential_reencrypt_failed", { orgId, provider }, error);
        });
    }
    return opened.value;
  }
  const row = mem().get(key(orgId, provider));
  if (!row) return null;
  const opened = decryptGuardianConfigDetailed<string>(row.encryptedToken, associatedData(orgId, provider));
  if (opened.version === "v1" || opened.staleKey) {
    row.encryptedToken = encryptGuardianConfig(opened.value, associatedData(orgId, provider));
  }
  return opened.value;
}

export async function deleteConnection(orgId: string, provider: IntegrationProvider): Promise<void> {
  const conn = db();
  if (conn) {
    await conn.integrationConnection.deleteMany({ where: { orgId, provider } });
    return;
  }
  mem().delete(key(orgId, provider));
}

/** Test-only reset of the in-memory fallback store. */
export function __resetConnections(): void {
  g.__outsideIntegrationConnections = new Map();
}
