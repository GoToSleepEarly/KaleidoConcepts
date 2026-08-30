CREATE TYPE "CourseContentTimelineKind" AS ENUM ('message', 'operation', 'repair', 'notice');

CREATE TYPE "CourseContentTimelineStatus" AS ENUM ('running', 'succeeded', 'failed', 'stale');

ALTER TABLE "CourseContentChatMessage"
ADD COLUMN "kind" "CourseContentTimelineKind",
ADD COLUMN "status" "CourseContentTimelineStatus",
ADD COLUMN "operation" "CourseContentOperation",
ADD COLUMN "requestId" TEXT,
ADD COLUMN "title" TEXT,
ADD COLUMN "details" JSONB,
ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "CourseContentChatMessage_courseId_eventKey_key"
ON "CourseContentChatMessage"("courseId", "eventKey");

CREATE INDEX "CourseContentChatMessage_courseId_requestId_createdAt_idx"
ON "CourseContentChatMessage"("courseId", "requestId", "createdAt");
