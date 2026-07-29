/**
 * The provider registry. To add a provider: write its adapter + a
 * ProviderDefinition, then register it here. Nothing else — the credential
 * store, connection-test service, route, telemetry, audit and UI are shared.
 */

import type { IntegrationProvider } from "@/lib/integrations/connections";
import type { ProviderDefinition } from "./types";
import { toDescriptor } from "./types";
import { hibpProvider } from "./hibp";
import { securityTrailsProvider } from "./securitytrails";

const REGISTRY: Record<string, ProviderDefinition> = {
  [hibpProvider.id]: hibpProvider,
  [securityTrailsProvider.id]: securityTrailsProvider,
};

/** Look up a provider by URL/id. Returns null for anything not registered. */
export function getProvider(id: string): ProviderDefinition | null {
  return REGISTRY[id] ?? null;
}

export function listProviders(): ProviderDefinition[] {
  return Object.values(REGISTRY);
}

/** Bring-your-own-key providers, as non-secret descriptors for the UI. */
export function listByokDescriptors() {
  return listProviders()
    .filter((p) => p.credentialKind === "api_key")
    .map(toDescriptor);
}

export function isRegistered(id: string): id is IntegrationProvider {
  return id in REGISTRY;
}
