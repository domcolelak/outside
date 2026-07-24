-- CreateTable
CREATE TABLE "scan_opt_outs" (
    "domain" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_opt_outs_pkey" PRIMARY KEY ("domain")
);
