import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { studentInputSchema } from "@/lib/validation";

export async function GET() {
  const students = await prisma.student.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ students });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const input = Object.fromEntries(formData);
  const parsed = studentInputSchema.safeParse(input);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.student.create({ data: parsed.data });

  return NextResponse.redirect(new URL("/students", request.url), 303);
}
