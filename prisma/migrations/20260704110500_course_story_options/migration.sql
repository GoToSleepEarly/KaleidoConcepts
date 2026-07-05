ALTER TABLE "Course"
  ADD COLUMN "selectedStoryOptionId" TEXT;

CREATE TABLE "CourseStoryOption" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "logline" TEXT NOT NULL,
  "chapters" JSONB NOT NULL,
  "teachingDesign" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseStoryOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseStoryOption_courseId_idx" ON "CourseStoryOption"("courseId");

ALTER TABLE "CourseStoryOption"
  ADD CONSTRAINT "CourseStoryOption_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
