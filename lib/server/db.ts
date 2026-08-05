import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import type { AuthDb } from "@/lib/server/repositories/auth";
import type { CoursesDb } from "@/lib/server/repositories/courses";
import type { PeopleDb } from "@/lib/server/repositories/people";
import type { PersonVisualsDb } from "@/lib/server/repositories/person-visuals";
import type { PresetsDb } from "@/lib/server/repositories/presets";

export type AppDb = AuthDb & PeopleDb & PersonVisualsDb & PresetsDb & CoursesDb;

let prisma: AppDb | null = null;

export function getDb(): AppDb {
  if (prisma) return prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter }) as unknown as AppDb;
  return prisma;
}
