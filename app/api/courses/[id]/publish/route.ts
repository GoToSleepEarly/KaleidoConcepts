import { NextResponse } from "next/server";

import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
} from "@/lib/server/repositories/course-preview";
import {
  CoursePublishStatusError,
  publishCourse,
} from "@/lib/server/repositories/course-presentation";
import { getDb } from "@/lib/server/db";
import type { CoursePresentationUpdate } from "@/lib/contracts/api";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await props.params;
  const body = (await request.json().catch(() => null)) as Partial<CoursePresentationUpdate> | null;
  const db = getDb();

  try {
    const result = await publishCourse(db, courseId, body ?? undefined);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "课程发布失败";
    if (error instanceof CoursePreviewNotFoundError) {
      return NextResponse.json({ message }, { status: 404 });
    }
    if (error instanceof CoursePreviewPrerequisiteError) {
      return NextResponse.json({ message }, { status: 400 });
    }
    if (error instanceof CoursePublishStatusError) {
      return NextResponse.json({ message }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
