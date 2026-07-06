CREATE TABLE "CourseLessonDraft" (
  "courseId" TEXT NOT NULL,
  "sourceStoryOptionId" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseLessonDraft_pkey" PRIMARY KEY ("courseId")
);

ALTER TABLE "CourseLessonDraft"
  ADD CONSTRAINT "CourseLessonDraft_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
