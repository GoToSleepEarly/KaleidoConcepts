-- CreateEnum
CREATE TYPE "AiGenerationFeature" AS ENUM ('lesson_chat');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('succeeded', 'failed');

-- CreateTable
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "feature" "AiGenerationFeature" NOT NULL,
    "intent" TEXT NOT NULL,
    "llmModel" "LlmModel" NOT NULL,
    "input" JSONB NOT NULL,
    "outputText" TEXT NOT NULL DEFAULT '',
    "status" "AiGenerationStatus" NOT NULL,
    "errorMessage" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGenerationLog_courseId_createdAt_idx" ON "AiGenerationLog"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_feature_createdAt_idx" ON "AiGenerationLog"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_status_createdAt_idx" ON "AiGenerationLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
