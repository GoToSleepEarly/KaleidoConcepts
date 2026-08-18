ALTER TABLE "CourseCharacter" ADD COLUMN "englishName" TEXT;

UPDATE "CourseCharacter"
SET "englishName" = "displayName"
WHERE "englishName" IS NULL;

ALTER TABLE "CourseCharacter" ALTER COLUMN "englishName" SET NOT NULL;
