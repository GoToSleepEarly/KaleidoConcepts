import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import type { AuthDb } from "@/lib/server/repositories/auth";
import type { CourseImagesDb } from "@/lib/server/repositories/course-images";
import type { CoursePreviewDb } from "@/lib/server/repositories/course-preview";
import type { CoursesDb } from "@/lib/server/repositories/courses";
import type { LessonDraftsDb } from "@/lib/server/repositories/lesson-drafts";
import type { LessonChatDb } from "@/lib/server/repositories/lesson-chat";
import type { PeopleDb } from "@/lib/server/repositories/people";
import type { PresetsDb } from "@/lib/server/repositories/presets";

export type AppDb = AuthDb &
  PeopleDb &
  PresetsDb &
  CoursesDb &
  LessonDraftsDb &
  LessonChatDb &
  CourseImagesDb &
  CoursePreviewDb;

let prisma: AppDb | null = null;

export function getDb(): AppDb {
  if (prisma) {
    return prisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter }) as unknown as AppDb;

  return prisma;
}
