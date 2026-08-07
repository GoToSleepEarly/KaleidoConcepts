import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { archiveCourse, CourseNotFoundError } from "@/lib/server/repositories/courses";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await archiveCourse(getDb(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CourseNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "课程删除失败，请重试" }, { status: 500 });
  }
}
