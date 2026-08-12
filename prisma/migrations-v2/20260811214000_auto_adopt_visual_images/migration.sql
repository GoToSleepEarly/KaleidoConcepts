-- Step 5 now treats every successfully generated image as the active version by default.
-- Backfill slots created before that rule so existing courses have the same behavior.
UPDATE "CourseVisualImageSlot" AS slot
SET
  "activeImageId" = (
    SELECT image."id"
    FROM "CourseImage" AS image
    WHERE image."slotId" = slot."id" AND image."status" = 'succeeded'
    ORDER BY image."createdAt" DESC
    LIMIT 1
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE slot."activeImageId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "CourseImage" AS image
    WHERE image."slotId" = slot."id" AND image."status" = 'succeeded'
  );

UPDATE "CourseCharacterVisual" AS visual
SET
  "activeImageId" = (
    SELECT image."id"
    FROM "CourseImage" AS image
    WHERE image."characterVisualId" = visual."id" AND image."status" = 'succeeded'
    ORDER BY image."createdAt" DESC
    LIMIT 1
  ),
  "status" = 'ready',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE visual."activeImageId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "CourseImage" AS image
    WHERE image."characterVisualId" = visual."id" AND image."status" = 'succeeded'
  );
