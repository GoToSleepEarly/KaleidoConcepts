import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { CoursePreviewNotFoundError, CoursePreviewPrerequisiteError, getCoursePreview } from "@/lib/server/repositories/course-preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getCoursePreview(getDb(), (await params).id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "课程预览加载失败";
    return NextResponse.json({ message }, { status: error instanceof CoursePreviewNotFoundError ? 404 : error instanceof CoursePreviewPrerequisiteError ? 400 : 500 });
  }
}
