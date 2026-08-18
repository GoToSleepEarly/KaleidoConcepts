CREATE TYPE "StoryOperationStatus" AS ENUM ('running', 'succeeded', 'failed', 'result_unknown', 'superseded');

ALTER TABLE "CourseStorySetting"
ADD COLUMN "stateRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "operationRequestId" TEXT,
ADD COLUMN "operationAction" TEXT,
ADD COLUMN "operationPhase" TEXT,
ADD COLUMN "operationStatus" "StoryOperationStatus",
ADD COLUMN "operationError" TEXT,
ADD COLUMN "operationInput" JSONB,
ADD COLUMN "operationStartedAt" TIMESTAMP(3);
