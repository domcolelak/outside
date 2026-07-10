# Architecture

## Overview

OUTSIDE is a single **Next.js 14 (App Router) + TypeScript** application. This is a deliberate
choice: the product's value is a real-time, visual, single-tenant-feeling experience over a small
data domain (one organization's external surface). A single deployable gives us SSR for the landing
page, API routes for discovery, and native streaming — with the lowest possible operational and
handover complexity.

```
                         ┌────────────────────────────────────────────┐
  Browser                │  Next.js app (Node runtime)                 │
  ┌───────────────┐  SSE │  ┌──────────────┐   ┌───────────────────┐   │
  │ Landing       │◀────▶│  │ /api/scan    │──▶│ Discovery engine  │   │
  │ Scan view     │      │  │ (SSE route)  │   │  (lib/discovery)  │   │
  │  - canvas graph│     │  └──────────────┘   └─────────┬─────────┘   │
  │  - console     │     │        ▲                      │             │
  │  - Attacker View│    │        │ rate limit / validate │            │
  └───────────────┘      │  ┌─────┴───────┐    ┌─────────▼─────────┐   │
                         │  │ lib/security│    │ Providers          │  │
                         │  └─────────────┘    │  crt.sh / DoH      │  │
                         │                     └─────────┬─────────┘   │
                         └───────────────────────────────┼────────────┘
                                                          ▼
                                          Public sources (CT logs, DNS)
```

## The discovery pipeline

The pipeline maps directly onto the epistemic layers the product requires:

| Stage | Module | Output |
| --- | --- | --- |
| Discovery provider | `lib/discovery/providers.ts` | Raw hostnames, DNS/MX/TXT records |
| Normalization | `lib/security/target.ts`, provider filters | Canonical FQDNs (lowercase, no trailing dot, punycode, wildcard-stripped) |
| Entity resolution | `filterCtHosts`, engine dedupe by `canonical` | One `Asset` per real entity across providers |
| Graph construction | `lib/discovery/engine.ts` | `Asset[]` + `Edge[]` with relationship confidence |
| Classification | `lib/analysis/signals.ts` | `Signal[]` (assurance + confidence + rationale) |
| HTTP + TLS observation | `lib/discovery/http.ts` | Security headers + certificate facts on the primary web surface (SSRF-pinned) |
| Scoring | `lib/analysis/scoring.ts` | `ExposureScore` (deterministic, component-summed) |
| Finding generation | `lib/analysis/findings.ts` | `Finding[]` (fact/inference/concern separated) |
| **Aegis intelligence** | `lib/aegis/recommendations.ts` | `Posture` — `Recommendation[]` + potential score |
| **Aegis state / learning** | `lib/aegis/store.ts` | Recommendation status + audit trail (persisted) |
| AI explanation | `lib/ai/explainer.ts` | Executive + per-finding summaries only; never mutates the above |

### One pipeline: Discover → Understand → Monitor → Protect → Improve

Aegis is **not** a second product bolted on — it is the layer that consumes the *same* finalized
`ScanResult` (assets, findings, score, change history) and produces intelligence:

```
Discovery ─▶ Normalization ─▶ Evidence ─▶ Graph + Signals ─▶ Scoring + Findings
   └─ Guardian (scheduled scans + change detection + alerts)  [Monitor]
        └─ Aegis (recommendations + posture + remediation + audit)  [Protect / Improve]
```

### Aegis lineage — merged from the Aegis AI incident investigator

Aegis's intelligence is a native port of the best parts of the **Aegis AI incident investigator**
(a separate Python project). Its guiding principle is identical to OUTSIDE's — *deterministic reduces
the problem space; AI interprets what remains* — which is why the merge is a clean re-expression, not
a bolted-on service. What was ported into TypeScript (`lib/aegis/investigation.ts`), operating on
OUTSIDE's findings instead of log events:

| Aegis AI (incident investigation) | OUTSIDE Aegis (exposure investigation) |
| --- | --- |
| Weighted correlation strategies (temporal, trace, dependency, similarity, cascade) with per-strategy score breakdown | Weighted strategies over findings (`same_asset`, `graph_adjacency`, `shared_parent`, `exposure_cascade`, `temporal_change`) — same auditable breakdown |
| Causal graph, roots ranked by blast-radius × earliness × impact | Incidents (connected components) ranked by blast-radius × recency × severity |
| Strongest causal chain (Dijkstra over −log score) | Correlation-chain narrative per incident |
| Devil's Advocate attacks the leading hypothesis; Commander must report surviving contradicting evidence | `ExposureAssessment` that **always** carries `contradictingEvidence`, derived from observed facts (CDN/WAF mitigation, low org-attribution confidence, inference-based signals) |
| PatchProposal: validated diff, path-jailed, **never auto-applied** | Concrete `ChangeProposal` (`lib/aegis/proposal.ts`): exact DNS records / headers, deterministically validated to stay in-scope of the target with declared-coverage, `autoApply: false`, previewed for approval |
| `LLMProvider` seam + resilience (rate-limit + retry) | `Explainer` wrapped with a concurrency semaphore + transient-only retry with full-jitter backoff (`lib/ai/resilience.ts`) |

The deterministic assessment is the default (works offline, honest); an AI provider is an optional
enhancement over the *same* structure, now hardened with the ported resilience wrappers. Remediation
carries a concrete, validated `ChangeProposal` (the ported PatchProposal safety model): the exact
records/headers to apply, checked to stay inside the target's registrable domain, **never
auto-applied**. What is intentionally **not** ported: Aegis AI's full six-agent orchestration and
pgvector incident memory — OUTSIDE's smaller evidence set is served better by the deterministic
investigator with the counter-evidence discipline than by a multi-agent loop.

The linchpin is **honesty by construction**: the exposure score is `100 + Σ(component impacts)`, and
each recommendation references the score component it neutralizes, so its `estimatedReduction` (and
therefore the "potential score", e.g. `42 → 100`) is read from the deterministic model — never
invented. Recommendation *status* is the only mutable state Aegis owns; it lives in `lib/aegis/store.ts`
(in-memory or Prisma) with an append-only audit trail, so "resolve once, stay resolved" and every
change is accountable. Remediation is always **preview → approve → apply → verify → rollback**, and
defaults to human-applied **guided** steps; connectors (`lib/aegis/integrations.ts`) are optional and,
when connected, let Aegis *apply* what it already recommends.

### Epistemic separation
Every inference is a `Signal` or `Finding` carrying an `assurance` of `observed | inferred | possible`
and a `confidence` in `[0,1]`. The UI renders these distinctly (`AssuranceTag`). This is enforced by
the type system — an `Asset` holds `evidence` (facts) and `signals` (inferences) in separate fields.

## Entity resolution

Providers can describe the same asset differently (`API.COMPANY.COM.`, `https://api.company.com/`,
`api.company.com:443`). Resolution:
1. **Normalize** to a canonical FQDN (`normalizeDomain`): strip scheme/credentials/path/port, lowercase, remove trailing dot, punycode-encode IDN, strip `*.` wildcard prefixes.
2. **Key by `canonical`** — the engine and demo factory assign asset ids from the canonical form, so duplicate observations collapse into one node.
3. **Boundary-safe attribution** (`filterCtHosts`) — a host is attributed to the target only if it equals the registrable domain or is a proper `.`-boundary subdomain, so `testexample.com` is never merged into `example.com`.

Shared infrastructure (CDN/cloud IPs) is represented as **relationships with confidence < 1**, never
as ownership — the code never claims an asset belongs to the org purely from an IP relationship.

## Data model (`lib/types.ts`)

Core entities: `RawObservation`, `Asset` (+ `Evidence`, `Signal`), `Edge`, `Finding`,
`ScoreComponent`/`ExposureScore`, `AttackerBeat`, `ProviderRun`, `ScanResult`, and the streaming
`ScanEvent` union.

**Temporal identity (roadmap persistence).** `Asset` carries `firstObservedAt`/`lastObservedAt` and a
stable `canonical` identity key. The intended persistence model separates a stable `asset_identity`
(keyed by canonical) from per-scan `asset_snapshot` rows, so an asset that disappears in scan 2 and
returns in scan 5 keeps one identity with a gap in its snapshot history. Change detection is then a
diff of consecutive snapshot sets. This is specified in [`ROADMAP.md`](ROADMAP.md); the in-memory core
already produces the snapshot-shaped `ScanResult` these rows would store.

## Real-time streaming

`/api/scan` is an SSE endpoint returning a `ReadableStream`. The engine emits a typed `ScanEvent`
sequence: `stage` (start/done), `log`, `asset`, `edge`, and a terminal `result` or `error`. Progress
is **stage-based**, never a fabricated percentage. The client (`components/useScan.ts`) is a small
state machine that accumulates assets/edges/logs and drives the graph and console.

## The graph (`components/graph/AssetGraph.tsx`)

A dependency-free canvas renderer with a velocity-Verlet force simulation (repulsion + link springs +
centering gravity + damping). Chosen over a library for performance, a distinctive look, and zero
supply-chain risk. Supports pan, zoom, click hit-testing, selection highlighting, progressive
grow-in animation, and priority/kind coloring. `O(n²)` repulsion is fine for the hundreds-of-nodes
range; the documented path to 1,000+ nodes is a Barnes–Hut quadtree (see ROADMAP).

## Deployment

- **Build:** `npm run build` (lint + strict typecheck + static generation).
- **Run:** `npm run start` (Node server; `/api/scan` is dynamic/streamed).
- **Targets:** Vercel, Fly.io, a container, or bare Node. No database is required for the current core.
- **Headers:** security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.mjs`.

## Observability

Structured scan identifiers (`scan_*`) are generated per request and included in the SSE stream;
provider runs are modeled (`ProviderRun`) for status/timing/error reporting. Production wiring
(structured log sink, metrics, health endpoint) is in [`ROADMAP.md`](ROADMAP.md). Secrets are never
logged; provider errors are surfaced as user-safe messages.
