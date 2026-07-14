# Database migration procedure

New databases run `npm run db:migrate` and apply the baseline plus all later migrations.

Older installations created with `prisma db push` already contain the baseline schema. Before their first migration deployment, back up the database and mark only the baseline as applied:

```bash
npx prisma migrate resolve --applied 20260714000000_baseline
npm run db:migrate
```

The security migration intentionally deletes legacy global target history and recommendation state. Those rows predate organization ownership and cannot be assigned safely without a possible cross-tenant disclosure. Existing organization-scoped accounts, memberships, monitors, subscriptions, and valid organization-bound verification rows are retained. Unconsumed legacy plaintext invites are revoked.

Always rehearse migrations against a restored production backup and verify row counts, foreign keys, cron claims, and application health before promoting the release.
