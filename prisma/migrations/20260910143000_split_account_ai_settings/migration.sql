ALTER TABLE "User"
ALTER COLUMN "writingProvider" DROP DEFAULT,
ALTER COLUMN "writingProvider" TYPE TEXT
USING CASE "writingProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  WHEN 'quickrouter_deepseek' THEN 'deepseek-chat'
  ELSE "writingProvider"::TEXT
END,
ALTER COLUMN "writingProvider" SET DEFAULT 'gpt-5.6-sol',
ALTER COLUMN "aiGateway" DROP DEFAULT,
ALTER COLUMN "aiGateway" TYPE TEXT USING "aiGateway"::TEXT,
ALTER COLUMN "aiGateway" SET DEFAULT 'quickrouter',
ALTER COLUMN "quickRouterEndpoint" DROP DEFAULT,
ALTER COLUMN "quickRouterEndpoint" TYPE TEXT USING "quickRouterEndpoint"::TEXT,
ALTER COLUMN "quickRouterEndpoint" SET DEFAULT 'main',
ADD COLUMN "imageModel" TEXT NOT NULL DEFAULT 'gpt-image-2',
ADD COLUMN "imageGateway" TEXT,
ADD COLUMN "imageQuickRouterEndpoint" TEXT;

UPDATE "User"
SET
  "imageGateway" = "aiGateway",
  "imageQuickRouterEndpoint" = "quickRouterEndpoint";

ALTER TABLE "User"
ALTER COLUMN "imageGateway" SET NOT NULL,
ALTER COLUMN "imageGateway" SET DEFAULT 'quickrouter',
ALTER COLUMN "imageQuickRouterEndpoint" SET NOT NULL,
ALTER COLUMN "imageQuickRouterEndpoint" SET DEFAULT 'main';

ALTER TABLE "CourseStoryOutline"
ALTER COLUMN "writingProvider" DROP DEFAULT,
ALTER COLUMN "writingProvider" TYPE TEXT
USING CASE "writingProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  WHEN 'quickrouter_deepseek' THEN 'deepseek-chat'
  ELSE "writingProvider"::TEXT
END,
ALTER COLUMN "writingProvider" SET DEFAULT 'gpt-5.6-sol';

ALTER TABLE "CourseStorySetting"
ALTER COLUMN "writingProvider" DROP DEFAULT,
ALTER COLUMN "writingProvider" TYPE TEXT
USING CASE "writingProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  WHEN 'quickrouter_deepseek' THEN 'deepseek-chat'
  ELSE "writingProvider"::TEXT
END,
ALTER COLUMN "writingProvider" SET DEFAULT 'gpt-5.6-sol';

ALTER TABLE "CourseLessonContent"
ALTER COLUMN "writingProvider" DROP DEFAULT,
ALTER COLUMN "writingProvider" TYPE TEXT
USING CASE "writingProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  WHEN 'quickrouter_deepseek' THEN 'deepseek-chat'
  ELSE "writingProvider"::TEXT
END,
ALTER COLUMN "writingProvider" SET DEFAULT 'gpt-5.6-sol';

ALTER TABLE "AiGenerationLog"
ALTER COLUMN "writingProvider" TYPE TEXT
USING CASE "writingProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  WHEN 'quickrouter_deepseek' THEN 'deepseek-chat'
  ELSE "writingProvider"::TEXT
END;

DROP TYPE "StoryWritingProvider";
DROP TYPE "AiGateway";
DROP TYPE "QuickRouterEndpoint";
