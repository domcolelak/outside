-- CreateTable
CREATE TABLE "integration_connections" (
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "accountHint" TEXT NOT NULL,
    "zones" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("orgId","provider")
);
