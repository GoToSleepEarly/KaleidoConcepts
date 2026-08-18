CREATE TYPE "CharacterVisualIntent" AS ENUM ('preserve_identity', 'originalize');
CREATE TYPE "CharacterVisualSource" AS ENUM ('person_asset', 'uploaded_reference', 'generated_baseline');
CREATE TYPE "CharacterVisualStatus" AS ENUM ('missing', 'generating', 'ready', 'failed', 'stale');
CREATE TYPE "CourseImageSlotType" AS ENUM ('character_baseline', 'visual_cover', 'lesson_shot');
CREATE TYPE "CourseImageOperation" AS ENUM ('initial', 'revision');
CREATE TYPE "CourseImageQuality" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "CourseImageStatus" AS ENUM ('pending', 'submitting', 'generating', 'succeeded', 'failed');
CREATE TYPE "CourseImageProvider" AS ENUM ('quickrouter_gpt_image_2');

ALTER TABLE "Course" ADD COLUMN "visualQuality" "CourseImageQuality" NOT NULL DEFAULT 'medium';

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

CREATE TABLE "CourseVisualResourcePlan" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sourceRevision" TEXT NOT NULL,
  "coverBrief" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseVisualResourcePlan_pkey" PRIMARY KEY ("id")
);

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
  "prompt" TEXT NOT NULL,
  "activeImageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseVisualImageSlot_pkey" PRIMARY KEY ("id")
);

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
  "idempotencyKey" TEXT NOT NULL,
  "status" "CourseImageStatus" NOT NULL DEFAULT 'pending',
  "provider" "CourseImageProvider" NOT NULL DEFAULT 'quickrouter_gpt_image_2',
  "providerTaskId" TEXT,
  "providerImageUrl" TEXT,
  "storagePath" TEXT,
  "publicUrl" TEXT,
  "temporarySourcePath" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseCharacterVisual_characterId_key" ON "CourseCharacterVisual"("characterId");
CREATE INDEX "CourseCharacterVisual_courseId_status_idx" ON "CourseCharacterVisual"("courseId", "status");
CREATE INDEX "CourseCharacterVisual_personVisualAssetId_idx" ON "CourseCharacterVisual"("personVisualAssetId");
CREATE UNIQUE INDEX "CourseVisualResourcePlan_courseId_key" ON "CourseVisualResourcePlan"("courseId");
CREATE UNIQUE INDEX "CourseVisualImageSlot_courseId_stableKey_key" ON "CourseVisualImageSlot"("courseId", "stableKey");
CREATE INDEX "CourseVisualImageSlot_courseId_chapterId_idx" ON "CourseVisualImageSlot"("courseId", "chapterId");
CREATE UNIQUE INDEX "CourseImage_courseId_idempotencyKey_key" ON "CourseImage"("courseId", "idempotencyKey");
CREATE INDEX "CourseImage_courseId_status_idx" ON "CourseImage"("courseId", "status");
CREATE INDEX "CourseImage_slotId_createdAt_idx" ON "CourseImage"("slotId", "createdAt");
CREATE INDEX "CourseImage_characterVisualId_createdAt_idx" ON "CourseImage"("characterVisualId", "createdAt");

ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CourseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseVisualResourcePlan" ADD CONSTRAINT "CourseVisualResourcePlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseVisualImageSlot" ADD CONSTRAINT "CourseVisualImageSlot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourseVisualImageSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_characterVisualId_fkey" FOREIGN KEY ("characterVisualId") REFERENCES "CourseCharacterVisual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "CourseImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseCharacterVisual" ADD CONSTRAINT "CourseCharacterVisual_activeImageId_fkey" FOREIGN KEY ("activeImageId") REFERENCES "CourseImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseVisualImageSlot" ADD CONSTRAINT "CourseVisualImageSlot_activeImageId_fkey" FOREIGN KEY ("activeImageId") REFERENCES "CourseImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
