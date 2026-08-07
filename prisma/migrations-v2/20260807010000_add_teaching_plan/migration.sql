CREATE TYPE "TeachingPlanStatus" AS ENUM ('draft', 'confirmed');
CREATE TYPE "EnglishLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

CREATE TABLE "CourseTeachingPlan" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" "TeachingPlanStatus" NOT NULL DEFAULT 'draft',
  "englishLevel" "EnglishLevel",
  "chapters" JSONB NOT NULL,
  "afterClassPractice" JSONB NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseTeachingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseTeachingPlan_courseId_key" ON "CourseTeachingPlan"("courseId");

ALTER TABLE "CourseTeachingPlan"
ADD CONSTRAINT "CourseTeachingPlan_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
