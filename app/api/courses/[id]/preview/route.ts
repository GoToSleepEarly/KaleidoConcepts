import { NextResponse } from "next/server";

import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  getCoursePreview,
} from "@/lib/server/repositories/course-preview";
import { getDb } from "@/lib/server/db";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await props.params;
  const db = getDb();

  try {
    const preview = await getCoursePreview(db, courseId);
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "课程预览加载失败";
    if (error instanceof CoursePreviewNotFoundError) {
      return NextResponse.json({ message }, { status: 404 });
    }
    if (error instanceof CoursePreviewPrerequisiteError) {
      return NextResponse.json({ message }, { status: 400 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
