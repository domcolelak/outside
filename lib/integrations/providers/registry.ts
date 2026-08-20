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
import { azureProvider } from "./azure";
import { m365Provider } from "./m365";
import { gcpProvider } from "./gcp";
import { googleWorkspaceProvider } from "./google-workspace";

const REGISTRY = {
  hibp: hibpProvider,
  securitytrails: securityTrailsProvider,
  shodan: shodanProvider,
  abuseipdb: abuseIpdbProvider,
  greynoise: greyNoiseProvider,
  virustotal: virusTotalProvider,
  openai: openAiProvider,
  censys: censysProvider,
  vercel: vercelProvider,
  netlify: netlifyProvider,
  digitalocean: digitalOceanProvider,
  aws: awsProvider,
  fastly: fastlyProvider,
  github: gitHubProvider,
  azure: azureProvider,
  m365: m365Provider,
  gcp: gcpProvider,
  google_workspace: googleWorkspaceProvider,
} satisfies Record<Exclude<IntegrationProvider, "cloudflare">, ProviderDefinition>;

const REGISTRY_BY_ID: Readonly<Record<string, ProviderDefinition>> = REGISTRY;

/** Look up a provider by URL/id. Returns null for anything not registered. */
export function getProvider(id: string): ProviderDefinition | null {
  return REGISTRY_BY_ID[id] ?? null;
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
  return id in REGISTRY_BY_ID;
}
