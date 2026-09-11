-- Only one cost-bearing visual-plan operation may run for a course at a time.
ALTER TABLE "AiGenerationLog" ADD COLUMN "activeScope" TEXT;

CREATE UNIQUE INDEX "AiGenerationLog_activeScope_key" ON "AiGenerationLog"("activeScope");
