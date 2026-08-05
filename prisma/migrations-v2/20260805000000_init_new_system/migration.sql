CREATE TYPE "PersonRole" AS ENUM ('student', 'teacher');
CREATE TYPE "Gender" AS ENUM ('male', 'female');
CREATE TYPE "PersonVisualSourceMode" AS ENUM ('photo', 'description', 'revision');
CREATE TYPE "PersonVisualStatus" AS ENUM ('pending', 'submitting', 'succeeded', 'failed');
CREATE TYPE "PersonVisualProvider" AS ENUM ('quickrouter_gpt_image_2');
CREATE TYPE "CourseLifecycle" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "CourseStage" AS ENUM ('audience', 'story_outline', 'teaching_plan', 'content', 'visual_resources', 'preview');
CREATE TYPE "PresetOptionKind" AS ENUM ('theme', 'grammar');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "lifecycleStatus" "CourseLifecycle" NOT NULL DEFAULT 'draft',
    "currentStage" "CourseStage" NOT NULL DEFAULT 'audience',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "Person_role_archivedAt_idx" ON "Person"("role", "archivedAt");
CREATE INDEX "Person_chineseName_idx" ON "Person"("chineseName");
CREATE INDEX "Person_englishName_idx" ON "Person"("englishName");
CREATE INDEX "PersonVisualAsset_personId_createdAt_idx" ON "PersonVisualAsset"("personId", "createdAt");
CREATE INDEX "PersonVisualAsset_status_updatedAt_idx" ON "PersonVisualAsset"("status", "updatedAt");
CREATE UNIQUE INDEX "PersonVisualAsset_personId_idempotencyKey_key" ON "PersonVisualAsset"("personId", "idempotencyKey");
CREATE UNIQUE INDEX "Course_idempotencyKey_key" ON "Course"("idempotencyKey");
CREATE INDEX "Course_lifecycleStatus_updatedAt_idx" ON "Course"("lifecycleStatus", "updatedAt");
CREATE INDEX "CoursePerson_personId_createdAt_idx" ON "CoursePerson"("personId", "createdAt");
CREATE UNIQUE INDEX "CoursePerson_courseId_personId_key" ON "CoursePerson"("courseId", "personId");
CREATE INDEX "PresetOption_kind_archivedAt_idx" ON "PresetOption"("kind", "archivedAt");
CREATE UNIQUE INDEX "PresetOption_kind_label_key" ON "PresetOption"("kind", "label");

ALTER TABLE "Person" ADD CONSTRAINT "Person_activeVisualAssetId_fkey" FOREIGN KEY ("activeVisualAssetId") REFERENCES "PersonVisualAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonVisualAsset" ADD CONSTRAINT "PersonVisualAsset_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonVisualAsset" ADD CONSTRAINT "PersonVisualAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "PersonVisualAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_visualAssetIdSnapshot_fkey" FOREIGN KEY ("visualAssetIdSnapshot") REFERENCES "PersonVisualAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
