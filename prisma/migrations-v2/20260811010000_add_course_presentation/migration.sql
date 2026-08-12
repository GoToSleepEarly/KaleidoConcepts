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

ALTER TABLE "CoursePresentation" ADD CONSTRAINT "CoursePresentation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
