import { NextResponse } from "next/server";

import { generateStoryOptions } from "@/lib/ai-provider";
import { prisma } from "@/lib/db";
import { lessonBriefSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: { student: true },
  });

  if (!course.student) {
    return NextResponse.json({ error: "Course has no student." }, { status: 400 });
  }

  const meta = course.meta as { lessonBrief?: unknown };
  const brief = lessonBriefSchema.parse(meta.lessonBrief);
  const options = generateStoryOptions(course.student, brief);

  await prisma.course.update({
    where: { id },
    data: {
      status: "options_ready",
      storyOptions: options,
    },
  });

  await prisma.aiUsageLog.create({
    data: {
      courseId: id,
      resourceType: "story_options",
      provider: "local-dev",
      model: process.env.TEXT_MODEL,
      promptVersion: process.env.PROMPT_VERSION,
      status: "succeeded",
    },
  });

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
