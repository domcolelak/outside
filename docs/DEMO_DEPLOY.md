# Public demo deployment (Vercel)

A one-click-ish way to publish a live, publicly reachable OUTSIDE instance for a
"Try it out" link. This is a **real production build** (the app fails closed and
refuses in-memory storage in production), so it needs a small managed Postgres.
A free Neon database is enough.

The headline of the demo needs **no account**: anyone can open
`/scan?target=northstar&mode=demo`, watch the discovery graph build, open
Attacker View, and read the deterministic findings. Sign-up, Guardian and
billing also work once the database is attached.

## 1. Create a free Postgres (Neon)

1. Create a project at <https://neon.tech> (free tier).
2. Copy the connection string. Use the **pooled** connection string for the app
   and append `?sslmode=require` if it is not already present, e.g.
   `postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/outside?sslmode=require`.

## 2. Import the repo into Vercel

1. At <https://vercel.com/new>, import `domcolelak/outside`.
2. Framework preset: **Next.js** (auto-detected). Leave the build command as
   configured in `vercel.json` (`prisma migrate deploy && next build`) — it
   applies migrations before building.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Required (production fails to boot without a complete, independent set):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Neon pooled connection string from step 1 |
| `OUTSIDE_STORAGE_MODE` | `database` |
| `APP_URL` | your Vercel URL, e.g. `https://outside-demo.vercel.app` |
| `AUTH_SECRET` | an independent 32-byte random string |
| `OUTSIDE_VERIFY_SECRET` | a different independent 32-byte random string |
| `CRON_SECRET` | a different independent 32-byte random string |
| `RESEND_API_KEY` | any ≥16-char placeholder (email is fire-and-forget in the demo) |
| `EMAIL_FROM` | `OUTSIDE Demo <demo@example.com>` |

Optional — enables the OpenAI-backed executive summary / finding explanations:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | your OpenAI key |
| `OUTSIDE_OPENAI_MODEL` | `gpt-4o-mini` (default) |

Set each for the **Production** environment. `APP_URL` must exactly match the
deployed origin (set it after the first deploy assigns the domain, then redeploy).

## 4. Deploy

Trigger the deploy. The build runs `prisma migrate deploy` against Neon, then
`next build`. When it is live:

- `https://<domain>/api/health` should report `database.ready: true`.
- `https://<domain>/scan?target=northstar&mode=demo` runs the anonymous demo.

Use the deployed URL as the Devpost **"Try it out"** link.

## Notes

- `NODE_ENV=production` on Vercel enforces the full trust boundary: durable
  storage, HTTPS `APP_URL`, and four independent secrets. This is intentional;
  there is no in-memory production mode.
- The demo dataset is synthetic (`*.example`) and clearly labelled. Anonymous
  scans of real domains use passive public sources only and are not persisted.
- This demo deployment is not the persistent staging described in
  `ops/staging/README.md`; managed backups, PITR, observability and a real
  operator paging path remain part of the pre-pilot checklist.
