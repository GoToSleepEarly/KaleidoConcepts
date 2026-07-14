-- AlterEnum
ALTER TYPE "CourseStatus" ADD VALUE IF NOT EXISTS 'published';

-- CreateTable
CREATE TABLE IF NOT EXISTS "CoursePresentation" (
    "courseId" TEXT NOT NULL,
    "coverTheme" TEXT NOT NULL DEFAULT 'dark',
    "coverTitleFontSize" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "chapterTheme" TEXT NOT NULL DEFAULT 'blue-purple',
    "slideOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePresentation_pkey" PRIMARY KEY ("courseId")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoursePresentation_courseId_fkey') THEN
        ALTER TABLE "CoursePresentation" ADD CONSTRAINT "CoursePresentation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
