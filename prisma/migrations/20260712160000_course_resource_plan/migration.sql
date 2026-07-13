ALTER TYPE "CourseImageSlotType" ADD VALUE IF NOT EXISTS 'visual_cover';

CREATE TABLE "CourseResourcePlan" (
    "courseId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedCoverImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseResourcePlan_pkey" PRIMARY KEY ("courseId")
);

ALTER TABLE "CourseResourcePlan" ADD CONSTRAINT "CourseResourcePlan_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseImage" ALTER COLUMN "chapterId" DROP NOT NULL;
ALTER TABLE "CourseImage" ADD COLUMN "sourceParagraphId" TEXT;
ALTER TABLE "CourseImage" ADD COLUMN "sourceSentenceIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CourseImage" ADD COLUMN "heroMomentSentenceId" TEXT;
ALTER TABLE "CourseImage" ADD COLUMN "sourceExcerpt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CourseImage" ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'step4-resource-plan-v1';
ALTER TABLE "CourseImage" ADD COLUMN "referenceImageIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CourseImage" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 1280;
ALTER TABLE "CourseImage" ADD COLUMN "height" INTEGER NOT NULL DEFAULT 720;
ALTER TABLE "CourseImage" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'webp';
