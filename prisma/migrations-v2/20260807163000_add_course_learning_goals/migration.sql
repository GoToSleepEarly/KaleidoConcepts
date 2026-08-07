ALTER TABLE "Course"
ADD COLUMN "englishLevel" "EnglishLevel",
ADD COLUMN "knowledgePointIds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "CourseStoryOutlineChapter"
ADD COLUMN "recommendedKnowledgePointIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "knowledgePointRecommendationSummary" TEXT NOT NULL DEFAULT '';
