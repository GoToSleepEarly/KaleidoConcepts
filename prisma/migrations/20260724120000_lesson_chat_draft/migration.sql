CREATE TABLE "LessonChatDraft" (
  "courseId" TEXT NOT NULL,
  "messages" JSONB NOT NULL,
  "draftText" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LessonChatDraft_pkey" PRIMARY KEY ("courseId")
);

ALTER TABLE "LessonChatDraft"
  ADD CONSTRAINT "LessonChatDraft_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
