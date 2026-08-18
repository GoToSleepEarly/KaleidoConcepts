ALTER TYPE "AiGenerationStatus" ADD VALUE IF NOT EXISTS 'running' BEFORE 'succeeded';

ALTER TABLE "AiGenerationLog"
ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "AiGenerationLog_requestId_key"
ON "AiGenerationLog"("requestId");
