import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string; optionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id, optionId } = await context.params;
  const course = await prisma.course.findUniqueOrThrow({ where: { id } });
  const options = (course.storyOptions ?? []) as Array<{ id: string }>;
  const selected = options.find((option) => option.id === optionId);

  if (!selected) {
    return NextResponse.json({ error: "Story option not found." }, { status: 404 });
  }

  await prisma.course.update({
    where: { id },
    data: { selectedStoryOption: selected },
  });

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
