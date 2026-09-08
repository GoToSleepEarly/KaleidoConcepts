ALTER TABLE "CourseStorySetting"
ADD COLUMN "operationRootRequestId" TEXT,
ADD COLUMN "operationRetryAttempt" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CourseStoryChatMessage"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "requestId" TEXT,
ADD COLUMN "rootRequestId" TEXT,
ADD COLUMN "action" TEXT,
ADD COLUMN "retryAttempt" INTEGER,
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "CourseStoryChatMessage_courseId_requestId_idx"
ON "CourseStoryChatMessage"("courseId", "requestId");
