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
import { shodanProvider } from "./shodan";
import { abuseIpdbProvider } from "./abuseipdb";
import { greyNoiseProvider } from "./greynoise";
import { virusTotalProvider } from "./virustotal";
import { openAiProvider } from "./openai";
import { censysProvider } from "./censys";
import { vercelProvider } from "./vercel";
import { netlifyProvider } from "./netlify";
import { digitalOceanProvider } from "./digitalocean";
import { awsProvider } from "./aws";
import { fastlyProvider } from "./fastly";
import { gitHubProvider } from "./github";

const REGISTRY: Record<string, ProviderDefinition> = {
  [hibpProvider.id]: hibpProvider,
  [securityTrailsProvider.id]: securityTrailsProvider,
  [shodanProvider.id]: shodanProvider,
  [abuseIpdbProvider.id]: abuseIpdbProvider,
  [greyNoiseProvider.id]: greyNoiseProvider,
  [virusTotalProvider.id]: virusTotalProvider,
  [openAiProvider.id]: openAiProvider,
  [censysProvider.id]: censysProvider,
  [vercelProvider.id]: vercelProvider,
  [netlifyProvider.id]: netlifyProvider,
  [digitalOceanProvider.id]: digitalOceanProvider,
  [awsProvider.id]: awsProvider,
  [fastlyProvider.id]: fastlyProvider,
  [gitHubProvider.id]: gitHubProvider,
};

/** Look up a provider by URL/id. Returns null for anything not registered. */
export function getProvider(id: string): ProviderDefinition | null {
  return REGISTRY[id] ?? null;
}

export function listProviders(): ProviderDefinition[] {
  return Object.values(REGISTRY);
}

/**
 * Bring-your-own-key providers, as non-secret descriptors for the UI. Every
 * credential kind is included — a pair provider is still BYOK, it just collects
 * two fields.
 */
export function listByokDescriptors() {
  return listProviders().map(toDescriptor);
}

export function isRegistered(id: string): id is IntegrationProvider {
  return id in REGISTRY;
}
