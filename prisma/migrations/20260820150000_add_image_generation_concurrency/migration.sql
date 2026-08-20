ALTER TABLE "Course"
ADD COLUMN "imageGenerationConcurrency" INTEGER NOT NULL DEFAULT 3,
ADD CONSTRAINT "Course_imageGenerationConcurrency_check"
CHECK ("imageGenerationConcurrency" BETWEEN 1 AND 5);
