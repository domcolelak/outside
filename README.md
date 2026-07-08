# OUTSIDE

**External digital exposure visualization platform.**
_You know your company from the inside. OUTSIDE shows you what everyone else sees._

Enter a domain and watch your publicly observable digital footprint reveal itself as an
interactive, cinematic asset graph — surfacing forgotten, unexpected, and changing external
assets, using only **passive, public, non-invasive** data sources.

![status](https://img.shields.io/badge/build-passing-38e1c3) ![tests](https://img.shields.io/badge/tests-22%20passing-38e1c3) ![license](https://img.shields.io/badge/license-proprietary-5b8cff)

---

## What this repository contains

This is a **working vertical slice** built to a production standard around the product's core
differentiator: cinematic external-surface discovery and visualization. It runs end-to-end with
**zero configuration and no external accounts**.

### Built and working today
- **Landing page** — premium dark hero with a live graph backdrop, concept, features, responsible-use, and pricing sections.
- **Passive discovery engine** — real Certificate Transparency (crt.sh) + DNS-over-HTTPS (Cloudflare) providers, with entity resolution and partial-success handling.
- **Cinematic live scan** — genuine **stage-based** streaming over Server-Sent Events (no fake percentages). Assets appear progressively in the graph as they are discovered.
- **Interactive asset graph** — dependency-free canvas force simulation: pan, zoom, node selection, relationship highlighting, priority/kind coloring, progressive reveal, legend.
- **Attacker View** — cinematic replay of how the surface was revealed, ending with _"In N seconds, N public assets were mapped."_ Framed responsibly as discovery, never exploitation.
- **Shadow / non-production / auth-surface classification** — weighted **signal correlation** (not naive keyword matching), each with confidence and a plain-English rationale.
- **Deterministic, explainable exposure score** — a 0–100 posture value with a full _"Why is my score X?"_ breakdown where every component sums to the total.
- **Evidence-backed findings** — every finding separates **observed fact → inferred signal → possible concern**, with reasoning, recommendation, evidence, and discovery method.
- **Temporal tracking & change detection** — repeated scans of a target preserve a stable asset identity across gaps (appears → disappears → returns) and diff into change events (new / returned / disappeared / technology-changed). Works out of the box via a zero-config in-memory store; a **PostgreSQL (Prisma)** backend provides durability when `DATABASE_URL` is set. Real scans never fabricate changes — a stable surface reports zero.
- **Demo mode** — three synthetic organizations (Northstar Labs, Velora Commerce, Atlas Financial) with a designed discovery storyline and change story, clearly labeled as synthetic.
- **Security layer** — target normalization, SSRF/private-range/metadata guards, and rate limiting, all unit-tested.

### Documented roadmap (architected, not yet implemented)
These are intentionally **not** shipped as broken stubs. The code is structured to accept them, and
each is specified in [`docs/ROADMAP.md`](docs/ROADMAP.md): accounts/organizations/RBAC, DNS-TXT domain
verification, background workers & scheduled monitoring, PDF export, transactional email & alerting,
Stripe billing, and the optional AI explanation layer. The domain model in
[`lib/types.ts`](lib/types.ts) and [`lib/persistence`](lib/persistence) already reflects the
temporal/evidence design these depend on.

To enable durable persistence: set `DATABASE_URL`, then `npm run db:push` (or `db:migrate`). Without
it the app runs on the in-memory store — no database required.

> This split is deliberate and honest: see [Technical honesty](#technical-honesty).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No `.env` is required. Try it immediately:
- Click a demo org (**Northstar Labs**) on the landing page, or
- Enter any real domain (e.g. `example.com`) to run a live passive scan.

### Scripts
| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs lint + typecheck) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run test` | Run the Vitest suite |
| `npm run lint` | Next.js lint |

---

## Architecture at a glance

**Next.js 14 (App Router) + TypeScript, single deployable.** One app keeps infrastructure
complexity low and handover trivial while still supporting SSR, API routes, and streaming.

```
Providers ─▶ Raw observations ─▶ Normalization ─▶ Entity resolution
   ─▶ Graph construction ─▶ Classification (signals) ─▶ Scoring ─▶ Findings ─▶ (AI explanation)
```

- **Discovery** — [`lib/discovery`](lib/discovery): modular providers (`providers.ts`), bounded/timed fetch + concurrency pool (`net.ts`), and the orchestrating `engine.ts` (demo + passive paths share one classification/scoring pass).
- **Analysis** — [`lib/analysis`](lib/analysis): `signals.ts` (correlation-based classification), `findings.ts`, `scoring.ts` (deterministic).
- **Security** — [`lib/security`](lib/security): `target.ts` (normalization + SSRF guards), `ratelimit.ts`.
- **Streaming API** — [`app/api/scan/route.ts`](app/api/scan/route.ts): SSE with a typed event contract (`lib/types.ts`).
- **UI** — [`components`](components): canvas graph, live console, node detail, summary/score, Attacker View.

Full rationale, tradeoffs, and the data model are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Key decisions
- **No graph database.** External surfaces of a single org are small (tens–hundreds of nodes). A relational store with a temporal snapshot model (roadmap) is simpler, cheaper, and sufficient. A graph DB would be fake enterprise complexity here.
- **Custom canvas graph, no library.** Guarantees performance, a distinctive look, and zero dependency risk during due diligence.
- **Deterministic core.** Discovery, correlation, scoring, and timestamps are fully deterministic and testable. AI is confined to explanation only and can never invent assets, findings, or evidence.

---

## Security & responsible use

OUTSIDE is a **defensive** product. It maps an organization's own public footprint; it contains no
exploitation, brute-force, credential, payload, or unauthorized-access capability, by design.

- **Passive by default** — only public CT and DNS sources are queried.
- **SSRF & egress guarded** — [`lib/security/target.ts`](lib/security/target.ts) normalizes targets and refuses IP literals, private/loopback/link-local/CGNAT ranges, and the `169.254.169.254` cloud-metadata endpoint at a single tested chokepoint.
- **Bounded scans** — per-scan host caps, request timeouts, and concurrency limits.
- **Rate limited** — fixed-window limiter per client (swappable for a shared store in production).
- **Ownership verification (roadmap)** — deeper inspection is gated behind DNS-TXT / file verification; unverified targets get a clearly-labeled external view.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model and abuse-prevention design.

---

## Technical honesty

Per the product's own guiding principle — _honest over impressive-but-fake_ — a few notes:
- **Real scans never fabricate.** If a provider fails or evidence is weak, the UI says so; unknown is shown as unknown.
- **Demo data is synthetic and labeled.** Demo organizations use reserved `.example` TLDs and are badged as demo everywhere they appear.
- **The roadmap is documented, not stubbed.** Rather than ship non-functional billing/auth/worker scaffolding pretending to be complete, those are specified in [`docs/ROADMAP.md`](docs/ROADMAP.md) with the integration points the current code already exposes.

---

## Testing

```bash
npm run test
```

22 tests cover target normalization, the SSRF/private-range guard (IPv4 + IPv6), CT entity-resolution
boundary handling, signal classification, deterministic scoring (sum-equals-total), and findings.
The suite does **not** depend on live internet access — it runs against fixtures and the deterministic
demo dataset.

## Deployment

Deploys as a single Next.js app to any Node host (Vercel, Fly.io, a container, or bare Node).
`npm run build && npm run start`. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#deployment).

## License
Proprietary — prepared for portfolio presentation and potential acquisition.
