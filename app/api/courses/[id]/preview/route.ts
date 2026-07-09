import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  getCoursePreview,
} from "@/lib/server/repositories/course-preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCoursePreview(getDb(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoursePreviewNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CoursePreviewPrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Course preview loading failed", error);
    return NextResponse.json({ message: "课程预览加载失败" }, { status: 500 });
  }
}
