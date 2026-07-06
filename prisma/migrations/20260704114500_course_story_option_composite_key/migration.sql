ALTER TABLE "CourseStoryOption"
  DROP CONSTRAINT "CourseStoryOption_pkey";

ALTER TABLE "CourseStoryOption"
  ADD CONSTRAINT "CourseStoryOption_pkey" PRIMARY KEY ("courseId", "id");
