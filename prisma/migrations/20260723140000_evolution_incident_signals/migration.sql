-- CreateTable
CREATE TABLE "evolution_incident_signals" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evolution_incident_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evolution_incident_signals_category_idx" ON "evolution_incident_signals"("category");
