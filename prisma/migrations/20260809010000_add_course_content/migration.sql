CREATE TYPE "CourseContentStatus" AS ENUM ('empty', 'generating_reading', 'reading_ready', 'generating_exercises', 'ready', 'failed', 'confirmed');
CREATE TYPE "CourseContentPhase" AS ENUM ('preparing', 'generating_chapters', 'validating_chapters', 'repairing_chapters', 'generating_main_idea', 'generating_exercises', 'validating_exercises');
CREATE TYPE "CourseContentOperation" AS ENUM ('reading', 'exercises', 'modify');
CREATE TYPE "CourseContentGenerationStatus" AS ENUM ('running', 'succeeded', 'failed', 'result_unknown');
CREATE TYPE "CourseContentTargetType" AS ENUM ('chapter', 'paragraph', 'chapter_practice', 'main_idea', 'homework');

CREATE TABLE "CourseLessonContent" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" "CourseContentStatus" NOT NULL DEFAULT 'empty',
  "phase" "CourseContentPhase",
  "writingProvider" "StoryWritingProvider" NOT NULL DEFAULT 'quickrouter_gpt',
  "sourceRevision" TEXT NOT NULL DEFAULT '',
  "contentVersion" INTEGER NOT NULL DEFAULT 0,
  "chapters" JSONB NOT NULL DEFAULT '[]',
  "mainIdea" JSONB,
  "homework" JSONB,
  "exercisesStale" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseLessonContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseContentGeneration" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "operation" "CourseContentOperation" NOT NULL,
  "sourceRevision" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "CourseContentGenerationStatus" NOT NULL DEFAULT 'running',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseContentGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseContentChatMessage" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "role" "CourseStoryChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "targetType" "CourseContentTargetType",
  "targetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseContentChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseLessonContent_courseId_key" ON "CourseLessonContent"("courseId");
CREATE UNIQUE INDEX "CourseContentGeneration_courseId_idempotencyKey_key" ON "CourseContentGeneration"("courseId", "idempotencyKey");
CREATE UNIQUE INDEX "CourseContentGeneration_courseId_sourceRevision_operation_key" ON "CourseContentGeneration"("courseId", "sourceRevision", "operation");
CREATE INDEX "CourseContentGeneration_courseId_createdAt_idx" ON "CourseContentGeneration"("courseId", "createdAt");
CREATE INDEX "CourseContentChatMessage_courseId_createdAt_idx" ON "CourseContentChatMessage"("courseId", "createdAt");

ALTER TABLE "CourseLessonContent" ADD CONSTRAINT "CourseLessonContent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseContentGeneration" ADD CONSTRAINT "CourseContentGeneration_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseContentChatMessage" ADD CONSTRAINT "CourseContentChatMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
