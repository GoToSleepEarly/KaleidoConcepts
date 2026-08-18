ALTER TABLE "CourseLessonContent"
ADD COLUMN "activeGenerationId" TEXT;

ALTER TABLE "CourseContentGeneration"
ADD COLUMN "baseContentVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "previousStatus" "CourseContentStatus" NOT NULL DEFAULT 'empty',
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "CourseContentGeneration"
SET
  "baseContentVersion" = content."contentVersion",
  "previousStatus" = CASE
    WHEN "CourseContentGeneration"."operation" = 'exercises' THEN 'reading_ready'::"CourseContentStatus"
    WHEN content."contentVersion" > 0 THEN 'ready'::"CourseContentStatus"
    ELSE 'empty'::"CourseContentStatus"
  END,
  "leaseExpiresAt" = "CourseContentGeneration"."updatedAt",
  "startedAt" = "CourseContentGeneration"."createdAt"
FROM "CourseLessonContent" AS content
WHERE content."courseId" = "CourseContentGeneration"."courseId";

UPDATE "CourseLessonContent" AS content
SET "activeGenerationId" = (
  SELECT generation."id"
  FROM "CourseContentGeneration" AS generation
  WHERE generation."courseId" = content."courseId"
    AND generation."status" = 'running'
  ORDER BY generation."updatedAt" DESC
  LIMIT 1
)
WHERE content."status" IN ('generating_reading', 'generating_exercises');

-- Rows without a matching running operation have no owner that can finish them.
-- Normalize them during migration so runtime code only needs the lease model.
UPDATE "CourseLessonContent"
SET
  "status" = CASE
    WHEN "status" = 'generating_exercises' THEN 'reading_ready'::"CourseContentStatus"
    ELSE 'failed'::"CourseContentStatus"
  END,
  "phase" = NULL,
  "errorMessage" = '上次处理已中断，现有内容已保留。可以重试或重新开始。'
WHERE "status" IN ('generating_reading', 'generating_exercises')
  AND "activeGenerationId" IS NULL;

CREATE INDEX "CourseContentGeneration_courseId_status_leaseExpiresAt_idx"
ON "CourseContentGeneration"("courseId", "status", "leaseExpiresAt");
