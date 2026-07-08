CREATE TYPE "CourseImageStatus" AS ENUM ('pending', 'submitting', 'generating', 'succeeded', 'failed');

CREATE TYPE "CourseImageSlotType" AS ENUM ('lesson_shot');

CREATE TYPE "CourseImageProvider" AS ENUM ('tencent_hunyuan');

CREATE TABLE "CourseImage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "slotType" "CourseImageSlotType" NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
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

CREATE UNIQUE INDEX "CourseImage_courseId_slotId_key" ON "CourseImage"("courseId", "slotId");

CREATE INDEX "CourseImage_courseId_status_idx" ON "CourseImage"("courseId", "status");

ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
