import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  await prisma.course.update({
    where: { id },
    data: {
      status: "archived",
      archivedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL("/courses", request.url), 303);
}
