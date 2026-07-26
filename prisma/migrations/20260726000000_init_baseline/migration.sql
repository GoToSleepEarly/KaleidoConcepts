-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LlmModel" AS ENUM ('deepseek_chat', 'gpt_5_5');

-- CreateEnum
CREATE TYPE "PresetOptionKind" AS ENUM ('theme', 'grammar');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('student', 'teacher');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "EnglishLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('draft', 'building_resources', 'ready', 'build_failed', 'published');

-- CreateEnum
CREATE TYPE "LessonDraftGenStatus" AS ENUM ('idle', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CourseImageStatus" AS ENUM ('pending', 'submitting', 'generating', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CourseImageSlotType" AS ENUM ('visual_cover', 'lesson_shot');

-- CreateEnum
CREATE TYPE "CourseImageProvider" AS ENUM ('tencent_hunyuan');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "name" TEXT NOT NULL,
    "chineseName" TEXT,
    "englishName" TEXT,
    "age" INTEGER,
    "gender" "Gender",
    "appearance" TEXT,
    "interests" TEXT[],
    "learningGoal" TEXT,
    "notes" TEXT,
    "avatarUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "englishLevel" "EnglishLevel" NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "grammar" TEXT[],
    "llmModel" "LlmModel" NOT NULL DEFAULT 'deepseek_chat',
    "selectedStoryOptionId" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'draft',
    "lessonDraftGenStatus" "LessonDraftGenStatus" NOT NULL DEFAULT 'idle',
    "lessonDraftGenStartedAt" TIMESTAMP(3),
    "lessonDraftGenError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePerson" (
    "courseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "CoursePerson_pkey" PRIMARY KEY ("courseId","personId")
);

-- CreateTable
CREATE TABLE "CourseStoryOption" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storyline" TEXT NOT NULL,
    "chapters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseStoryOption_pkey" PRIMARY KEY ("courseId","id")
);

-- CreateTable
CREATE TABLE "LessonChatDraft" (
    "courseId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "draftText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonChatDraft_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "CourseLessonDraft" (
    "courseId" TEXT NOT NULL,
    "sourceStoryOptionId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLessonDraft_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "CourseResourcePlan" (
    "courseId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseResourcePlan_pkey" PRIMARY KEY ("courseId")
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
CREATE TABLE "CourseImage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT,
    "shotId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "slotType" "CourseImageSlotType" NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "sourceParagraphId" TEXT,
    "sourceExcerpt" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT 'step4-resource-plan-v1',
    "referenceImageIds" JSONB NOT NULL DEFAULT '[]',
    "width" INTEGER NOT NULL DEFAULT 1280,
    "height" INTEGER NOT NULL DEFAULT 720,
    "format" TEXT NOT NULL DEFAULT 'webp',
    "sourceHash" TEXT NOT NULL,
    "status" "CourseImageStatus" NOT NULL,
    "provider" "CourseImageProvider" NOT NULL,
    "providerTaskId" TEXT,
    "providerImageUrl" TEXT,
    "storagePath" TEXT,
    "publicUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresetOption" (
    "id" TEXT NOT NULL,
    "kind" "PresetOptionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "CourseStoryOption_courseId_idx" ON "CourseStoryOption"("courseId");

-- CreateIndex
CREATE INDEX "CourseImage_courseId_status_idx" ON "CourseImage"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseImage_courseId_slotId_key" ON "CourseImage"("courseId", "slotId");

-- CreateIndex
CREATE INDEX "PresetOption_kind_archivedAt_idx" ON "PresetOption"("kind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresetOption_kind_label_key" ON "PresetOption"("kind", "label");

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseStoryOption" ADD CONSTRAINT "CourseStoryOption_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChatDraft" ADD CONSTRAINT "LessonChatDraft_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLessonDraft" ADD CONSTRAINT "CourseLessonDraft_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseResourcePlan" ADD CONSTRAINT "CourseResourcePlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePresentation" ADD CONSTRAINT "CoursePresentation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
