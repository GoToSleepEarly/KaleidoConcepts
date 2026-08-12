import { NextResponse } from "next/server";

import type { CoursePresentationUpdate } from "@/lib/contracts/api";
import { getDb } from "@/lib/server/db";
import { CoursePreviewNotFoundError, CoursePreviewPrerequisiteError, publishCourse } from "@/lib/server/repositories/course-preview";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => undefined) as Partial<CoursePresentationUpdate> | undefined;
    return NextResponse.json(await publishCourse(getDb(), (await params).id, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "课程发布失败";
    return NextResponse.json({ message }, { status: error instanceof CoursePreviewNotFoundError ? 404 : error instanceof CoursePreviewPrerequisiteError ? 400 : 500 });
  }
}
