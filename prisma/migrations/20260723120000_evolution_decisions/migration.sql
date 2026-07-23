-- CreateTable
CREATE TABLE "evolution_decisions" (
    "proposalId" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evolution_decisions_pkey" PRIMARY KEY ("proposalId")
);

-- CreateIndex
CREATE INDEX "evolution_decisions_product_idx" ON "evolution_decisions"("product");
