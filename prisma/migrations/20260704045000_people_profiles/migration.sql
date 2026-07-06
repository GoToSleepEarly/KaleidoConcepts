-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('student', 'teacher');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "name" TEXT NOT NULL,
    "chineseName" TEXT,
    "englishName" TEXT,
    "age" INTEGER,
    "gender" "Gender",
    "appearance" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learningGoal" TEXT,
    "notes" TEXT,
    "avatarUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- Preserve existing student records as student role people.
INSERT INTO "Person" (
    "id",
    "role",
    "name",
    "chineseName",
    "englishName",
    "age",
    "gender",
    "appearance",
    "interests",
    "learningGoal",
    "notes",
    "avatarUrl",
    "archivedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    'student'::"PersonRole",
    "englishName",
    "chineseName",
    "englishName",
    "age",
    "gender",
    NULL,
    "interests",
    "learningGoal",
    "notes",
    "avatarUrl",
    "archivedAt",
    "createdAt",
    "updatedAt"
FROM "Student";

-- CreateTable
CREATE TABLE "CoursePerson" (
    "courseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "CoursePerson_pkey" PRIMARY KEY ("courseId","personId")
);

-- Preserve course/student links as course/person links.
INSERT INTO "CoursePerson" ("courseId", "personId")
SELECT "courseId", "studentId"
FROM "CourseStudent";

-- DropForeignKey
ALTER TABLE "CourseStudent" DROP CONSTRAINT "CourseStudent_courseId_fkey";
ALTER TABLE "CourseStudent" DROP CONSTRAINT "CourseStudent_studentId_fkey";

-- Drop old tables after data copy.
DROP TABLE "CourseStudent";
DROP TABLE "Student";

-- AddForeignKey
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePerson" ADD CONSTRAINT "CoursePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
