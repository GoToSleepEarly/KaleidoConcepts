import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string; imageId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id, imageId } = await context.params;

  await prisma.courseImage.update({
    where: { id: imageId },
    data: {
      status: "pending",
      errorCode: null,
      errorMessage: null,
    },
  });

  await prisma.course.update({
    where: { id },
    data: {
      status: "building_resources",
      buildUpdatedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
