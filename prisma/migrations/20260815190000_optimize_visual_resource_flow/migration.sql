CREATE TYPE "VisualPlanMode" AS ENUM ('faithful', 'originalized');
CREATE TYPE "CourseImageFailureCode" AS ENUM ('retryable', 'storage_recoverable', 'invalid_request', 'policy_blocked', 'unknown');

ALTER TABLE "CourseVisualResourcePlan"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "mode" "VisualPlanMode" NOT NULL DEFAULT 'faithful',
  ADD COLUMN "confirmedCoverAssetId" TEXT;

ALTER TABLE "CourseVisualImageSlot"
  ADD COLUMN "sceneDescription" TEXT NOT NULL DEFAULT '';

ALTER TABLE "CourseImage"
  ADD COLUMN "planRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "failureCode" "CourseImageFailureCode";
