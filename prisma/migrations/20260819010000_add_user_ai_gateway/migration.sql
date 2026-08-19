CREATE TYPE "AiGateway" AS ENUM ('quickrouter', 'haoai');

ALTER TABLE "User"
ADD COLUMN "aiGateway" "AiGateway" NOT NULL DEFAULT 'quickrouter';

ALTER TYPE "PersonVisualProvider" ADD VALUE 'haoai_gpt_image_2';
ALTER TYPE "CourseImageProvider" ADD VALUE 'haoai_gpt_image_2';
