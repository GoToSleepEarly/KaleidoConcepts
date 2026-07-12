-- Story options move from lesson-design skeleton fields to concise Chinese outline fields.
-- Existing story options, lesson drafts, and generated images depend on the old shape and must be regenerated.

DELETE FROM "CourseImage";
DELETE FROM "CourseLessonDraft";
DELETE FROM "CourseStoryOption";

UPDATE "Course"
  SET "selectedStoryOptionId" = NULL,
      "status" = 'draft';

ALTER TABLE "CourseStoryOption"
  DROP COLUMN "logline",
  DROP COLUMN "centralConflict",
  ADD COLUMN "variant" TEXT NOT NULL,
  ADD COLUMN "storyline" TEXT NOT NULL;
