-- Keep "not evaluated" distinct from a pass so historical assessment summaries
-- cannot overstate assurance when a required provider was unavailable.
ALTER TABLE "assessment_runs"
ADD COLUMN "notEvaluated" INTEGER NOT NULL DEFAULT 0;
