CREATE TYPE "StoryComplexity" AS ENUM ('clear_linear', 'conflict_driven', 'layered');

ALTER TABLE "CourseStorySetting"
ADD COLUMN "storyComplexity" "StoryComplexity";
