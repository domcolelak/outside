-- Evolution scheduled-run state used to live only in process memory. Persist
-- both run history and the set of proposal ids ever seen so a restart cannot
-- make old coverage gaps appear new again.
CREATE TABLE "evolution_runs" (
  "id" TEXT NOT NULL,
  "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "proposalIds" JSONB NOT NULL,
  "total" INTEGER NOT NULL,
  "newCount" INTEGER NOT NULL,
  "firstRun" BOOLEAN NOT NULL,
  CONSTRAINT "evolution_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evolution_runs_ranAt_idx" ON "evolution_runs"("ranAt");

CREATE TABLE "evolution_proposals_seen" (
  "proposalId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evolution_proposals_seen_pkey" PRIMARY KEY ("proposalId")
);
