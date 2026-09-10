UPDATE "User"
SET "writingProvider" = 'deepseek-v4-pro'
WHERE "writingProvider" = 'deepseek-chat';

UPDATE "CourseStoryOutline"
SET "writingProvider" = 'deepseek-v4-pro'
WHERE "writingProvider" = 'deepseek-chat';

UPDATE "CourseStorySetting"
SET "writingProvider" = 'deepseek-v4-pro'
WHERE "writingProvider" = 'deepseek-chat';

UPDATE "CourseLessonContent"
SET "writingProvider" = 'deepseek-v4-pro'
WHERE "writingProvider" = 'deepseek-chat';

UPDATE "AiGenerationLog"
SET "writingProvider" = 'deepseek-v4-pro'
WHERE "writingProvider" = 'deepseek-chat';
