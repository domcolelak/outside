# Security model & responsible use

OUTSIDE is a **defensive** product that helps an organization understand its own public digital
footprint. It is engineered so it cannot easily be turned into an offensive or mass-scanning tool.

## Explicit non-goals (never to be added)
No exploitation, vulnerability execution, password attacks, credential stuffing, brute force, payload
delivery, persistence, malware, or unauthorized-access features. The product observes public data; it
does not attack.

## Discovery safety

- **Passive by default.** The current engine queries only Certificate Transparency (crt.sh) and
  DNS-over-HTTPS (Cloudflare) — public, non-invasive sources. It does not connect to the target's own
  services beyond public DNS/CT lookups.
- **Bounded work.** `MAX_HOSTS` per scan (default 60), per-request timeouts (`lib/discovery/net.ts`),
  and a bounded concurrency pool (`mapPool`) cap the work any single scan can perform.
- **Partial success.** Provider failures are isolated (`try/catch` per provider, `.catch(() => [])`
  per DoH query); one failing source degrades results but never crashes a scan.

## SSRF & egress controls — `lib/security/target.ts`

All target handling funnels through one tested chokepoint:

- **`normalizeDomain`** strips scheme/credentials/path/port, lowercases, removes trailing dots,
  punycode-encodes IDN, strips `*.` wildcard prefixes, rejects IP literals, and rejects reserved/
  internal TLDs (`local`, `internal`, `test`, `example`, `invalid`, `onion`, …).
- **`isSafePublicIp`** refuses, for any resolved address before a future active probe could connect:
  - IPv4: `0.0.0.0/8`, `10/8`, `127/8`, `169.254/16` (incl. `169.254.169.254` metadata), `172.16/12`, `192.168/16`, `100.64/10` (CGNAT), multicast/reserved.
  - IPv6: `::1`, `::`, `fe80::/10` link-local, `fc00::/7` unique-local, and IPv4-mapped addresses (validated against the IPv4 rules).

These are covered by unit tests in `lib/security/target.test.ts` (IPv4 + IPv6 vectors).

> **DNS-rebinding / redirect note (roadmap).** Active HTTP observation must resolve the host, validate
> **every** resolved IP with `isSafePublicIp`, pin the connection to a validated address, and re-validate
> on each redirect hop. The guard is already in place; the pinning connector is specified in ROADMAP
> and must land before any active-probe provider is enabled.

## Abuse prevention

- **Rate limiting** — `lib/security/ratelimit.ts` (fixed-window per client; default 12 scans/min).
  Production should swap the in-memory store for Redis/Upstash so limits hold across instances.
- **Ownership verification (roadmap)** — DNS-TXT and file-based verification gate any deeper
  inspection. Unverified targets receive a clearly-labeled **Unverified external view** built purely
  from public data; verified organizations unlock monitoring and deeper (still safe) inspection.
- **Audit logging (roadmap)** — scan attribution, target, requester, and outcome are modeled for an
  append-only audit trail.
- **Transport headers** — set in `next.config.mjs`.

## AI safety boundary

Deterministic discovery, correlation, scoring, and timestamps never depend on AI. The optional AI
layer (roadmap) may only **explain** existing evidence in natural language. It is architecturally
prevented from inventing assets, findings, or evidence: it receives the finalized `ScanResult` as
read-only input and its output is stored as a separate `AIAnalysis` artifact, never merged into the
deterministic graph or score.

## Responsible framing

**Attacker View** depicts external *discovery*, not compromise. Copy never claims a hack, breach, or
attack path. Findings distinguish observed fact from inference from possible concern, and state
"unknown" when evidence is insufficient.
