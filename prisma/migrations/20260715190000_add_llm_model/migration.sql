-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LlmModel') THEN
        CREATE TYPE "LlmModel" AS ENUM ('deepseek_chat', 'gpt_5_5');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Course"
    ADD COLUMN IF NOT EXISTS "llmModel" "LlmModel" NOT NULL DEFAULT 'deepseek_chat';
