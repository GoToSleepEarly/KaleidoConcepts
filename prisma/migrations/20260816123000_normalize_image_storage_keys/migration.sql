-- Image assets used to persist machine-specific absolute paths. Storage keys are
-- now relative to STORAGE_DIR so the same database can be used after moving the
-- application or changing the local persistent directory.
UPDATE "PersonVisualAsset"
SET "storagePath" = substring(replace("storagePath", E'\\', '/') from '(person-visuals/.*)$')
WHERE "storagePath" IS NOT NULL
  AND substring(replace("storagePath", E'\\', '/') from '(person-visuals/.*)$') IS NOT NULL;

UPDATE "PersonVisualAsset"
SET "temporarySourcePath" = substring(replace("temporarySourcePath", E'\\', '/') from '(person-visuals/.*)$')
WHERE "temporarySourcePath" IS NOT NULL
  AND substring(replace("temporarySourcePath", E'\\', '/') from '(person-visuals/.*)$') IS NOT NULL;

UPDATE "CourseImage"
SET "storagePath" = substring(replace("storagePath", E'\\', '/') from '(course-images/.*)$')
WHERE "storagePath" IS NOT NULL
  AND substring(replace("storagePath", E'\\', '/') from '(course-images/.*)$') IS NOT NULL;

UPDATE "CourseImage"
SET "temporarySourcePath" = substring(replace("temporarySourcePath", E'\\', '/') from '(course-images/.*)$')
WHERE "temporarySourcePath" IS NOT NULL
  AND substring(replace("temporarySourcePath", E'\\', '/') from '(course-images/.*)$') IS NOT NULL;
