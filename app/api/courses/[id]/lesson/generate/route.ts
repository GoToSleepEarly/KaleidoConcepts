import { NextResponse } from "next/server";

import { generateLessonText, type StoryOption } from "@/lib/ai-provider";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: { student: true },
  });

  if (!course.student || !course.selectedStoryOption) {
    return NextResponse.json({ error: "Select a story option before generating Lesson Text." }, { status: 400 });
  }

  const lessonText = generateLessonText(course.student, course.selectedStoryOption as StoryOption);

  await prisma.course.update({
    where: { id },
    data: {
      status: "lesson_ready",
      lessonText,
    },
  });

  await prisma.aiUsageLog.create({
    data: {
      courseId: id,
      resourceType: "lesson_text",
      provider: "local-dev",
      model: process.env.TEXT_MODEL,
      promptVersion: process.env.PROMPT_VERSION,
      status: "succeeded",
    },
  });

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
