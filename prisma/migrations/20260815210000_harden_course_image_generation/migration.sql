-- Existing in-flight rows cannot still have a live owner while this migration runs.
UPDATE "CourseImage"
SET
  "status" = 'failed',
  "failureCode" = 'retryable',
  "failureReason" = '上次图片生成已中断或超时，请重试'
WHERE "status" IN ('pending', 'submitting', 'generating');

ALTER TABLE "CourseImage"
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3);

CREATE INDEX "CourseImage_courseId_status_leaseExpiresAt_idx"
ON "CourseImage"("courseId", "status", "leaseExpiresAt");

-- A slot may have historical versions, but only one live generation for one plan revision.
CREATE UNIQUE INDEX "CourseImage_one_live_slot_generation"
ON "CourseImage"("slotId", "planRevision")
WHERE "slotId" IS NOT NULL AND "status" IN ('pending', 'submitting', 'generating');
