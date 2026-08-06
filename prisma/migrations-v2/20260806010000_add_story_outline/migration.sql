CREATE TYPE "StoryWritingProvider" AS ENUM ('quickrouter_gpt', 'quickrouter_deepseek');
CREATE TYPE "StoryResearchProvider" AS ENUM ('quickrouter_gpt', 'none');
CREATE TYPE "CourseStoryChatRole" AS ENUM ('teacher', 'assistant', 'system');
CREATE TYPE "CourseSourceReferenceType" AS ENUM ('real_person', 'historical_person', 'public_figure', 'ip', 'game_character', 'fictional_character', 'other');
CREATE TYPE "CourseSourceStatus" AS ENUM ('confirmed', 'insufficient', 'teacher_supplied');
CREATE TYPE "CourseCharacterSourceType" AS ENUM ('person', 'referenced', 'original');
CREATE TYPE "AiGenerationStatus" AS ENUM ('succeeded', 'failed');

CREATE TABLE "CourseStoryOutline" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterCount" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "writingProvider" "StoryWritingProvider" NOT NULL DEFAULT 'quickrouter_gpt',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseStoryOutline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseStorySetting" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterCount" INTEGER NOT NULL,
    "writingProvider" "StoryWritingProvider" NOT NULL DEFAULT 'quickrouter_gpt',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseStorySetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseStoryDirection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "whyFits" TEXT NOT NULL,
    "mainCharacters" JSONB NOT NULL,
    "classroomValue" TEXT NOT NULL,
    "seedPrompt" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseStoryDirection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseStoryChatMessage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "role" "CourseStoryChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseStoryChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSourceReference" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CourseSourceReferenceType" NOT NULL,
    "sourceStatus" "CourseSourceStatus" NOT NULL DEFAULT 'confirmed',
    "summary" TEXT NOT NULL,
    "usableFacts" JSONB NOT NULL,
    "avoidTopics" JSONB NOT NULL,
    "adaptationBoundary" TEXT NOT NULL,
    "researchProvider" "StoryResearchProvider" NOT NULL DEFAULT 'none',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSourceReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseCharacter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceType" "CourseCharacterSourceType" NOT NULL,
    "sourcePersonId" TEXT,
    "sourceReferenceId" TEXT,
    "roleInStory" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "visualDescription" TEXT,
    "shouldAppearInImages" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseCharacter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseStoryOutlineChapter" (
    "id" TEXT NOT NULL,
    "outlineId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "storyGoal" TEXT NOT NULL,
    "keyEvents" JSONB NOT NULL,
    "characterIds" JSONB NOT NULL,
    "setting" TEXT NOT NULL,
    "endingHook" TEXT NOT NULL,
    CONSTRAINT "CourseStoryOutlineChapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "stage" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL,
    "writingProvider" "StoryWritingProvider",
    "researchProvider" "StoryResearchProvider",
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseStoryOutline_courseId_key" ON "CourseStoryOutline"("courseId");
CREATE UNIQUE INDEX "CourseStorySetting_courseId_key" ON "CourseStorySetting"("courseId");
CREATE INDEX "CourseStoryDirection_courseId_createdAt_idx" ON "CourseStoryDirection"("courseId", "createdAt");
CREATE INDEX "CourseStoryChatMessage_courseId_createdAt_idx" ON "CourseStoryChatMessage"("courseId", "createdAt");
CREATE INDEX "CourseSourceReference_courseId_name_idx" ON "CourseSourceReference"("courseId", "name");
CREATE INDEX "CourseCharacter_courseId_sourceType_idx" ON "CourseCharacter"("courseId", "sourceType");
CREATE INDEX "CourseCharacter_sourcePersonId_idx" ON "CourseCharacter"("sourcePersonId");
CREATE INDEX "CourseCharacter_sourceReferenceId_idx" ON "CourseCharacter"("sourceReferenceId");
CREATE UNIQUE INDEX "CourseStoryOutlineChapter_outlineId_order_key" ON "CourseStoryOutlineChapter"("outlineId", "order");
CREATE INDEX "AiGenerationLog_courseId_createdAt_idx" ON "AiGenerationLog"("courseId", "createdAt");
CREATE INDEX "AiGenerationLog_stage_operation_createdAt_idx" ON "AiGenerationLog"("stage", "operation", "createdAt");

ALTER TABLE "CourseStoryOutline" ADD CONSTRAINT "CourseStoryOutline_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseStorySetting" ADD CONSTRAINT "CourseStorySetting_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseStoryDirection" ADD CONSTRAINT "CourseStoryDirection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseStoryChatMessage" ADD CONSTRAINT "CourseStoryChatMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSourceReference" ADD CONSTRAINT "CourseSourceReference_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "CourseSourceReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseStoryOutlineChapter" ADD CONSTRAINT "CourseStoryOutlineChapter_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "CourseStoryOutline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
