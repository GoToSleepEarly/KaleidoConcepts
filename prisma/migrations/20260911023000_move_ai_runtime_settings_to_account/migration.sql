ALTER TABLE "User"
ADD COLUMN "textReasoningEffort" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "textStreamingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "imageQuality" "CourseImageQuality" NOT NULL DEFAULT 'medium';

UPDATE "User"
SET "imageQuality" = 'high'
WHERE "imageModel" = 'gpt-image-2-c';

ALTER TABLE "User" ALTER COLUMN "imageQuality" SET DEFAULT 'high';
ALTER TABLE "User" ALTER COLUMN "aiGateway" SET DEFAULT 'easy88ai';
ALTER TABLE "User" ALTER COLUMN "imageModel" SET DEFAULT 'gpt-image-2-c';

ALTER TABLE "Course" DROP COLUMN "visualQuality";
