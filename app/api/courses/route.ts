import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { createCourseSchema } from "@/lib/validation";

export async function GET() {
  const courses = await prisma.course.findMany({
    include: { student: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = createCourseSchema.safeParse({
    studentId: formData.get("studentId"),
    lessonBrief: {
      cefrLevel: formData.get("cefrLevel"),
      knowledgePoints: formData.get("knowledgePoints"),
      targetVocabulary: formData.get("targetVocabulary"),
      theme: formData.get("theme"),
      specialRequirements: formData.get("specialRequirements"),
    },
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const student = await prisma.student.findFirstOrThrow({
    where: { id: parsed.data.studentId, archivedAt: null },
  });

  const course = await prisma.course.create({
    data: {
      studentId: student.id,
      status: "draft",
      meta: {
        studentSnapshot: {
          id: student.id,
          name: student.name,
          age: student.age,
          grade: student.grade,
          interests: student.interests,
          personality: student.personality,
          notes: student.notes,
        },
        lessonBrief: parsed.data.lessonBrief,
      },
    },
  });

  return NextResponse.redirect(new URL(`/courses/${course.id}`, request.url), 303);
}
