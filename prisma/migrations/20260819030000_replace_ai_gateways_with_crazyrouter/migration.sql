ALTER TYPE "PersonVisualProvider" ADD VALUE IF NOT EXISTS 'crazyrouter_gpt_image_2';
ALTER TYPE "CourseImageProvider" ADD VALUE IF NOT EXISTS 'crazyrouter_gpt_image_2';

ALTER TABLE "User" ALTER COLUMN "aiGateway" DROP DEFAULT;
ALTER TYPE "AiGateway" RENAME TO "AiGateway_legacy";
CREATE TYPE "AiGateway" AS ENUM ('quickrouter', 'crazyrouter');
ALTER TABLE "User"
ALTER COLUMN "aiGateway" TYPE "AiGateway"
USING (
  CASE
    WHEN "aiGateway"::text IN ('haoai', 'easy88ai') THEN 'crazyrouter'
    ELSE "aiGateway"::text
  END
)::"AiGateway";
ALTER TABLE "User" ALTER COLUMN "aiGateway" SET DEFAULT 'quickrouter';
DROP TYPE "AiGateway_legacy";
