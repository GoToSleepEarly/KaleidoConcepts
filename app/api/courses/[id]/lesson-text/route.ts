import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { lessonText } = (await request.json()) as { lessonText?: string };

  if (!lessonText?.trim()) {
    return NextResponse.json({ error: "Lesson Text is required." }, { status: 400 });
  }

  await prisma.course.update({
    where: { id },
    data: {
      status: "lesson_ready",
      lessonText,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const formData = await request.formData();
  const lessonText = String(formData.get("lessonText") ?? "");

  await prisma.course.update({
    where: { id },
    data: {
      status: "lesson_ready",
      lessonText,
    },
  });

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
