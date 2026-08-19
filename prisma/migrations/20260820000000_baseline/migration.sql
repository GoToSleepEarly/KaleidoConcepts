-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AiGateway" AS ENUM ('quickrouter', 'crazyrouter');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('student', 'teacher');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "PersonVisualSourceMode" AS ENUM ('photo', 'description', 'revision');

-- CreateEnum
CREATE TYPE "PersonVisualStatus" AS ENUM ('pending', 'submitting', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "PersonVisualProvider" AS ENUM ('quickrouter_gpt_image_2', 'crazyrouter_gpt_image_2');

-- CreateEnum
CREATE TYPE "CourseLifecycle" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "CourseStage" AS ENUM ('audience', 'story_outline', 'teaching_plan', 'content', 'visual_resources', 'preview');

-- CreateEnum
CREATE TYPE "PresetOptionKind" AS ENUM ('theme', 'story_type', 'story_tone', 'grammar');

-- CreateEnum
CREATE TYPE "StoryWritingProvider" AS ENUM ('quickrouter_gpt', 'quickrouter_deepseek');

-- CreateEnum
CREATE TYPE "StoryAlignmentStatus" AS ENUM ('idle', 'needs_clarification', 'ready_for_confirmation', 'confirmed');

-- CreateEnum
CREATE TYPE "StoryPlanningMode" AS ENUM ('explore_options', 'follow_defined_plot');

-- CreateEnum
CREATE TYPE "StoryResearchProvider" AS ENUM ('quickrouter_gpt', 'none');

-- CreateEnum
CREATE TYPE "CourseStoryChatRole" AS ENUM ('teacher', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "CourseSourceReferenceType" AS ENUM ('real_person', 'historical_person', 'public_figure', 'ip', 'game_character', 'fictional_character', 'other');

-- CreateEnum
CREATE TYPE "CourseSourceStatus" AS ENUM ('confirmed', 'insufficient', 'teacher_supplied');

-- CreateEnum
CREATE TYPE "CourseCharacterSourceType" AS ENUM ('person', 'referenced', 'original');

-- CreateEnum
CREATE TYPE "CharacterVisualIntent" AS ENUM ('preserve_identity', 'originalize');

-- CreateEnum
CREATE TYPE "CharacterVisualSource" AS ENUM ('person_asset', 'uploaded_reference', 'generated_baseline');

-- CreateEnum
CREATE TYPE "CharacterVisualStatus" AS ENUM ('missing', 'generating', 'ready', 'failed', 'stale');

-- CreateEnum
CREATE TYPE "CourseImageSlotType" AS ENUM ('character_baseline', 'visual_cover', 'lesson_shot');

-- CreateEnum
CREATE TYPE "CourseImageOperation" AS ENUM ('initial', 'revision');

-- CreateEnum
CREATE TYPE "CourseImageQuality" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "VisualPlanMode" AS ENUM ('faithful', 'originalized');

-- CreateEnum
CREATE TYPE "CourseImageFailureCode" AS ENUM ('retryable', 'storage_recoverable', 'invalid_request', 'policy_blocked', 'unknown');

-- CreateEnum
CREATE TYPE "CourseImageStatus" AS ENUM ('pending', 'submitting', 'generating', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CourseImageProvider" AS ENUM ('quickrouter_gpt_image_2', 'crazyrouter_gpt_image_2');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "TeachingPlanStatus" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "StoryOperationStatus" AS ENUM ('running', 'succeeded', 'failed', 'result_unknown', 'superseded');

-- CreateEnum
CREATE TYPE "CourseContentStatus" AS ENUM ('empty', 'generating_reading', 'reading_ready', 'generating_exercises', 'ready', 'failed', 'confirmed');

-- CreateEnum
CREATE TYPE "CourseContentPhase" AS ENUM ('preparing', 'generating_chapters', 'validating_chapters', 'repairing_chapters', 'generating_main_idea', 'validating_main_idea', 'repairing_main_idea', 'generating_exercises', 'validating_exercises');

-- CreateEnum
CREATE TYPE "CourseContentOperation" AS ENUM ('reading', 'exercises', 'modify');

-- CreateEnum
CREATE TYPE "CourseContentGenerationStatus" AS ENUM ('running', 'succeeded', 'failed', 'result_unknown');

-- CreateEnum
CREATE TYPE "CourseContentTargetType" AS ENUM ('chapter', 'paragraph', 'chapter_practice', 'main_idea', 'homework');

-- CreateEnum
CREATE TYPE "EnglishLevel" AS ENUM ('Starter', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aiGateway" "AiGateway" NOT NULL DEFAULT 'quickrouter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "chineseName" TEXT NOT NULL,
    "englishName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "notes" TEXT,
    "activeVisualAssetId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonVisualAsset" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "parentAssetId" TEXT,
    "sourceMode" "PersonVisualSourceMode" NOT NULL,
    "appearanceConfig" JSONB,
    "userInstruction" TEXT,
    "compiledPrompt" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PersonVisualStatus" NOT NULL DEFAULT 'pending',
    "provider" "PersonVisualProvider" NOT NULL,
    "providerImageUrl" TEXT,
    "storagePath" TEXT,
    "publicUrl" TEXT,
    "temporarySourcePath" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonVisualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "englishLevel" "EnglishLevel",
    "knowledgePointIds" JSONB NOT NULL DEFAULT '[]',
    "lifecycleStatus" "CourseLifecycle" NOT NULL DEFAULT 'draft',
    "currentStage" "CourseStage" NOT NULL DEFAULT 'audience',
    "visualQuality" "CourseImageQuality" NOT NULL DEFAULT 'medium',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePerson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "chineseNameSnapshot" TEXT NOT NULL,
    "englishNameSnapshot" TEXT NOT NULL,
    "ageSnapshot" INTEGER NOT NULL,
    "genderSnapshot" "Gender" NOT NULL,
    "visualAssetIdSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresetOption" (
    "id" TEXT NOT NULL,
    "kind" "PresetOptionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "labelZh" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "CourseStorySetting" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterCount" INTEGER NOT NULL,
    "writingProvider" "StoryWritingProvider" NOT NULL DEFAULT 'quickrouter_gpt',
    "alignmentStatus" "StoryAlignmentStatus" NOT NULL DEFAULT 'idle',
    "planningMode" "StoryPlanningMode" NOT NULL DEFAULT 'explore_options',
    "alignmentSummary" TEXT,
    "alignmentDetails" JSONB NOT NULL DEFAULT '{}',
    "alignmentConfirmedAt" TIMESTAMP(3),
    "stateRevision" INTEGER NOT NULL DEFAULT 0,
    "operationRequestId" TEXT,
    "operationAction" TEXT,
    "operationPhase" TEXT,
    "operationStatus" "StoryOperationStatus",
    "operationError" TEXT,
    "operationInput" JSONB,
    "operationStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseStorySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseStoryDirection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "whyFits" TEXT NOT NULL,
    "mainCharacters" JSONB NOT NULL,
    "storyHighlight" TEXT NOT NULL DEFAULT '',
    "growthCore" TEXT NOT NULL DEFAULT '',
    "classroomValue" TEXT NOT NULL,
    "seedPrompt" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseStoryDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseStoryChatMessage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "role" "CourseStoryChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseStoryChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "CourseCharacter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "englishName" TEXT NOT NULL,
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

-- CreateTable
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
    "recommendedKnowledgePointIds" JSONB NOT NULL DEFAULT '[]',
    "knowledgePointRecommendationSummary" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseStoryOutlineChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseTeachingPlan" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "TeachingPlanStatus" NOT NULL DEFAULT 'draft',
    "englishLevel" "EnglishLevel",
    "mainIdeaTargetWordCount" INTEGER NOT NULL DEFAULT 120,
    "chapters" JSONB NOT NULL,
    "afterClassPractice" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTeachingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCharacterVisual" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "intent" "CharacterVisualIntent",
    "source" "CharacterVisualSource",
    "personVisualAssetId" TEXT,
    "activeImageId" TEXT,
    "status" "CharacterVisualStatus" NOT NULL DEFAULT 'missing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCharacterVisual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseVisualResourcePlan" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "mode" "VisualPlanMode" NOT NULL DEFAULT 'faithful',
    "coverBrief" JSONB NOT NULL,
    "confirmedCoverAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseVisualResourcePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseVisualImageSlot" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "slotType" "CourseImageSlotType" NOT NULL,
    "chapterId" TEXT,
    "paragraphId" TEXT,
    "sourceText" TEXT NOT NULL,
    "characterIds" JSONB NOT NULL,
    "focus" TEXT NOT NULL,
    "sceneDescription" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "activeImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseVisualImageSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseImage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "slotId" TEXT,
    "characterVisualId" TEXT,
    "parentAssetId" TEXT,
    "operation" "CourseImageOperation" NOT NULL,
    "userInstruction" TEXT,
    "prompt" TEXT NOT NULL,
    "quality" "CourseImageQuality" NOT NULL,
    "referenceAssetIds" JSONB NOT NULL DEFAULT '[]',
    "sourceHash" TEXT NOT NULL,
    "planRevision" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "status" "CourseImageStatus" NOT NULL DEFAULT 'pending',
    "provider" "CourseImageProvider" NOT NULL DEFAULT 'quickrouter_gpt_image_2',
    "providerTaskId" TEXT,
    "providerImageUrl" TEXT,
    "storagePath" TEXT,
    "publicUrl" TEXT,
    "temporarySourcePath" TEXT,
    "failureReason" TEXT,
    "failureCode" "CourseImageFailureCode",
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "activeGenerationId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLessonContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePresentation" (
    "courseId" TEXT NOT NULL,
    "coverTheme" TEXT NOT NULL DEFAULT 'dark',
    "coverTitleFontSize" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "chapterTheme" TEXT NOT NULL DEFAULT 'blue-purple',
    "slideOverrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePresentation_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "CourseContentGeneration" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "operation" "CourseContentOperation" NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "CourseContentGenerationStatus" NOT NULL DEFAULT 'running',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "baseContentVersion" INTEGER NOT NULL DEFAULT 0,
    "previousStatus" "CourseContentStatus" NOT NULL DEFAULT 'empty',
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseContentGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Person_role_archivedAt_idx" ON "Person"("role", "archivedAt");

-- CreateIndex
CREATE INDEX "Person_chineseName_idx" ON "Person"("chineseName");

-- CreateIndex
CREATE INDEX "Person_englishName_idx" ON "Person"("englishName");

-- CreateIndex
CREATE INDEX "PersonVisualAsset_personId_createdAt_idx" ON "PersonVisualAsset"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonVisualAsset_status_updatedAt_idx" ON "PersonVisualAsset"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonVisualAsset_personId_idempotencyKey_key" ON "PersonVisualAsset"("personId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Course_idempotencyKey_key" ON "Course"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Course_lifecycleStatus_updatedAt_idx" ON "Course"("lifecycleStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "CoursePerson_personId_createdAt_idx" ON "CoursePerson"("personId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePerson_courseId_personId_key" ON "CoursePerson"("courseId", "personId");

-- CreateIndex
CREATE INDEX "PresetOption_kind_archivedAt_idx" ON "PresetOption"("kind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresetOption_kind_label_key" ON "PresetOption"("kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStoryOutline_courseId_key" ON "CourseStoryOutline"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStorySetting_courseId_key" ON "CourseStorySetting"("courseId");

-- CreateIndex
CREATE INDEX "CourseStoryDirection_courseId_createdAt_idx" ON "CourseStoryDirection"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseStoryChatMessage_courseId_createdAt_idx" ON "CourseStoryChatMessage"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseSourceReference_courseId_name_idx" ON "CourseSourceReference"("courseId", "name");

-- CreateIndex
CREATE INDEX "CourseCharacter_courseId_sourceType_idx" ON "CourseCharacter"("courseId", "sourceType");

-- CreateIndex
CREATE INDEX "CourseCharacter_sourcePersonId_idx" ON "CourseCharacter"("sourcePersonId");

-- CreateIndex
CREATE INDEX "CourseCharacter_sourceReferenceId_idx" ON "CourseCharacter"("sourceReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseStoryOutlineChapter_outlineId_order_key" ON "CourseStoryOutlineChapter"("outlineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTeachingPlan_courseId_key" ON "CourseTeachingPlan"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCharacterVisual_characterId_key" ON "CourseCharacterVisual"("characterId");

-- CreateIndex
CREATE INDEX "CourseCharacterVisual_courseId_status_idx" ON "CourseCharacterVisual"("courseId", "status");

-- CreateIndex
CREATE INDEX "CourseCharacterVisual_personVisualAssetId_idx" ON "CourseCharacterVisual"("personVisualAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseVisualResourcePlan_courseId_key" ON "CourseVisualResourcePlan"("courseId");

-- CreateIndex
CREATE INDEX "CourseVisualImageSlot_courseId_chapterId_idx" ON "CourseVisualImageSlot"("courseId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseVisualImageSlot_courseId_stableKey_key" ON "CourseVisualImageSlot"("courseId", "stableKey");

-- CreateIndex
CREATE INDEX "CourseImage_courseId_status_idx" ON "CourseImage"("courseId", "status");

-- CreateIndex
CREATE INDEX "CourseImage_courseId_status_leaseExpiresAt_idx" ON "CourseImage"("courseId", "status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "CourseImage_slotId_createdAt_idx" ON "CourseImage"("slotId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseImage_characterVisualId_createdAt_idx" ON "CourseImage"("characterVisualId", "createdAt");

-- A slot may have historical versions, but only one live generation for one plan revision.
CREATE UNIQUE INDEX "CourseImage_one_live_slot_generation"
ON "CourseImage"("slotId", "planRevision")
WHERE "slotId" IS NOT NULL AND "status" IN ('pending', 'submitting', 'generating');

-- CreateIndex
CREATE UNIQUE INDEX "CourseImage_courseId_idempotencyKey_key" ON "CourseImage"("courseId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLessonContent_courseId_key" ON "CourseLessonContent"("courseId");

-- CreateIndex
CREATE INDEX "CourseContentGeneration_courseId_createdAt_idx" ON "CourseContentGeneration"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseContentGeneration_courseId_status_leaseExpiresAt_idx" ON "CourseContentGeneration"("courseId", "status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseContentGeneration_courseId_idempotencyKey_key" ON "CourseContentGeneration"("courseId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CourseContentGeneration_courseId_sourceRevision_operation_key" ON "CourseContentGeneration"("courseId", "sourceRevision", "operation");

-- CreateIndex
CREATE INDEX "CourseContentChatMessage_courseId_createdAt_idx" ON "CourseContentChatMessage"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiGenerationLog_requestId_key" ON "AiGenerationLog"("requestId");

-- CreateIndex
CREATE INDEX "AiGenerationLog_courseId_createdAt_idx" ON "AiGenerationLog"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGenerationLog_stage_operation_createdAt_idx" ON "AiGenerationLog"("stage", "operation", "createdAt");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_activeVisualAssetId_fkey" FOREIGN KEY ("activeVisualAssetId") REFERENCES "PersonVisualAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonVisualAsset" ADD CONSTRAINT "PersonVisualAsset_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonVisualAsset" ADD CONSTRAINT "PersonVisualAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "PersonVisualAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_visualAssetIdSnapshot_fkey" FOREIGN KEY ("visualAssetIdSnapshot") REFERENCES "PersonVisualAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStoryOutline" ADD CONSTRAINT "CourseStoryOutline_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStorySetting" ADD CONSTRAINT "CourseStorySetting_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStoryDirection" ADD CONSTRAINT "CourseStoryDirection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStoryChatMessage" ADD CONSTRAINT "CourseStoryChatMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSourceReference" ADD CONSTRAINT "CourseSourceReference_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacter" ADD CONSTRAINT "CourseCharacter_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "CourseSourceReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStoryOutlineChapter" ADD CONSTRAINT "CourseStoryOutlineChapter_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "CourseStoryOutline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeachingPlan" ADD CONSTRAINT "CourseTeachingPlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CourseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_activeImageId_fkey" FOREIGN KEY ("activeImageId") REFERENCES "CourseImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVisualResourcePlan" ADD CONSTRAINT "CourseVisualResourcePlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVisualImageSlot" ADD CONSTRAINT "CourseVisualImageSlot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVisualImageSlot" ADD CONSTRAINT "CourseVisualImageSlot_activeImageId_fkey" FOREIGN KEY ("activeImageId") REFERENCES "CourseImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseVisualImageSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_characterVisualId_fkey" FOREIGN KEY ("characterVisualId") REFERENCES "CourseCharacterVisual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "CourseImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLessonContent" ADD CONSTRAINT "CourseLessonContent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePresentation" ADD CONSTRAINT "CoursePresentation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseContentGeneration" ADD CONSTRAINT "CourseContentGeneration_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseContentChatMessage" ADD CONSTRAINT "CourseContentChatMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
