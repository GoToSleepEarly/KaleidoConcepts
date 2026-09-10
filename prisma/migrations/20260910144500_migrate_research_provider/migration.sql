ALTER TABLE "CourseSourceReference"
ALTER COLUMN "researchProvider" DROP DEFAULT,
ALTER COLUMN "researchProvider" TYPE TEXT
USING CASE "researchProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  ELSE "researchProvider"::TEXT
END,
ALTER COLUMN "researchProvider" SET DEFAULT 'none';

ALTER TABLE "AiGenerationLog"
ALTER COLUMN "researchProvider" TYPE TEXT
USING CASE "researchProvider"::TEXT
  WHEN 'quickrouter_gpt' THEN 'gpt-5.6-sol'
  ELSE "researchProvider"::TEXT
END;

DROP TYPE "StoryResearchProvider";
