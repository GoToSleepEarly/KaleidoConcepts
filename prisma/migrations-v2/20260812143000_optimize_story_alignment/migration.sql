CREATE TYPE "StoryAlignmentStatus" AS ENUM ('idle', 'needs_clarification', 'ready_for_confirmation', 'confirmed');
CREATE TYPE "StoryPlanningMode" AS ENUM ('explore_options', 'follow_defined_plot');

ALTER TABLE "CourseStorySetting"
ADD COLUMN "alignmentStatus" "StoryAlignmentStatus" NOT NULL DEFAULT 'idle',
ADD COLUMN "planningMode" "StoryPlanningMode" NOT NULL DEFAULT 'explore_options',
ADD COLUMN "alignmentSummary" TEXT,
ADD COLUMN "alignmentDetails" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "alignmentConfirmedAt" TIMESTAMP(3);

ALTER TABLE "CourseStoryDirection"
ADD COLUMN "storyHighlight" TEXT NOT NULL DEFAULT '',
ADD COLUMN "growthCore" TEXT NOT NULL DEFAULT '';
