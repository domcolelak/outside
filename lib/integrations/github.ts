/**
 * GitHub — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The token travels
 * as a bearer credential.
 *
 * GitHub is the one connector here that does not register domains, so
 * attributing by "domains the account owns" would be forced. What it genuinely
 * owns that is publicly reachable is GitHub Pages sites with a custom domain —
 * real external surface, frequently forgotten, and exactly the kind of asset
 * that turns up in a scan with nobody able to say whose it is.
 *
 * A read-scoped token is enough. The walk is bounded to a fixed number of
 * repositories so a large account cannot turn attribution into a crawl.
 *
 * The token is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.github.com";
const LABEL = "GitHub";
/** Bounded: attribution must stay cheap regardless of how many repositories exist. */
const MAX_REPOS = 50;

export type GitHubResult<T> = ({ ok: true } & T) | ProviderFailure;

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    // GitHub rejects requests without a user agent.
    "user-agent": process.env.GITHUB_USER_AGENT?.trim() || "OUTSIDE-Guardian",
  };
}

/** Prove the token works and read the account it belongs to. Costs no rate budget beyond one call. */
export async function verifyKey(token: string, signal?: AbortSignal): Promise<GitHubResult<{ account: string }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/user`, headers(token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by GitHub — the token may lack the read scopes this connector needs.",
      });
    }
    const u = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    return { ok: true, account: typeof u.login === "string" ? u.login : "Connected" };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * Custom domains configured on this account's GitHub Pages sites. Only
 * repositories that actually have Pages enabled are queried, and the walk stops
 * at MAX_REPOS.
 */
export async function ownedDomains(token: string, signal?: AbortSignal): Promise<GitHubResult<{ domains: string[] }>> {
  try {
    const listed = await providerGet(`${API}/user/repos?per_page=${MAX_REPOS}&sort=pushed`, headers(token), signal);
    if (listed.status !== 200) return mapProviderStatus(listed.status, { label: LABEL, retryAfter: listed.retryAfter });

    const repos = Array.isArray(listed.body) ? listed.body : [];
    const domains = new Set<string>();

    for (const repo of repos) {
      if (!repo || typeof repo !== "object") continue;
      const r = repo as Record<string, unknown>;
      // has_pages avoids a 404 round-trip for every repository without a site.
      if (r.has_pages !== true) continue;
      const fullName = typeof r.full_name === "string" ? r.full_name : null;
      if (!fullName) continue;

      const pages = await providerGet(`${API}/repos/${fullName}/pages`, headers(token), signal);
      if (pages.status !== 200 || !pages.body || typeof pages.body !== "object") continue;
      const cname = (pages.body as { cname?: unknown }).cname;
      if (typeof cname === "string" && cname) domains.add(cname.trim().toLowerCase());
    }

    return { ok: true, domains: [...domains] };
  } catch {
    return networkFailure(LABEL);
  }
}

/** GitHub tokens carry known prefixes but classic PATs are bare hex; keep it loose. */
export function looksLikeGitHubToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20 && trimmed.length <= 255 && /^[A-Za-z0-9_]+$/.test(trimmed);
}
