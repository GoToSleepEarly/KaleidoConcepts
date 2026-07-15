-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LessonDraftGenStatus') THEN
        CREATE TYPE "LessonDraftGenStatus" AS ENUM ('idle', 'running', 'succeeded', 'failed');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Course"
    ADD COLUMN IF NOT EXISTS "lessonDraftGenStatus" "LessonDraftGenStatus" NOT NULL DEFAULT 'idle',
    ADD COLUMN IF NOT EXISTS "lessonDraftGenStartedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lessonDraftGenError" TEXT;
