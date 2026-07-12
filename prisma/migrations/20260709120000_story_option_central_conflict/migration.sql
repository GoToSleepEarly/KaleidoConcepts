-- Story options move from `teachingDesign` + `summary` chapters to
-- `centralConflict` + three-beat chapters. Old story options, lesson drafts,
-- and generated images are incompatible and must be regenerated.

DELETE FROM "CourseImage";
DELETE FROM "CourseLessonDraft";
DELETE FROM "CourseStoryOption";

UPDATE "Course"
  SET "selectedStoryOptionId" = NULL,
      "status" = 'draft';

ALTER TABLE "CourseStoryOption"
  DROP COLUMN "teachingDesign",
  ADD COLUMN "centralConflict" TEXT NOT NULL;
