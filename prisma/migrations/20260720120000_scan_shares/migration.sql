-- CreateTable
CREATE TABLE "scan_shares" (
    "token" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scan_shares_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "scan_shares_expiresAt_idx" ON "scan_shares"("expiresAt");
