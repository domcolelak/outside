ALTER TABLE "organizations"
  ADD COLUMN "stripeEventCreated" INTEGER,
  ADD COLUMN "stripeEventRank" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeEventId" TEXT;

CREATE INDEX "organizations_stripeEventCreated_idx" ON "organizations"("stripeEventCreated");
