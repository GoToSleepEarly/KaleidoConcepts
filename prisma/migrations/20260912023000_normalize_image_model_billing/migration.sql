ALTER TABLE "User"
ADD COLUMN "imageBillingMode" TEXT NOT NULL DEFAULT 'per_image';

UPDATE "User"
SET "imageBillingMode" = 'metered'
WHERE "imageModel" = 'gpt-image-2'
  AND "imageGateway" = 'quickrouter';

UPDATE "User"
SET "imageModel" = 'gpt-image-2'
WHERE "imageModel" = 'gpt-image-2-c';

ALTER TABLE "User"
ALTER COLUMN "imageModel" SET DEFAULT 'gpt-image-2';
