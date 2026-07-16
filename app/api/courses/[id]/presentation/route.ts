import { NextResponse } from "next/server";

import { CoursePreviewNotFoundError } from "@/lib/server/repositories/course-preview";
import { upsertPresentation } from "@/lib/server/repositories/course-presentation";
import { getDb } from "@/lib/server/db";
import type { CoursePresentationUpdate } from "@/lib/contracts/api";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await props.params;
  const body = (await request.json()) as Partial<CoursePresentationUpdate>;
  const db = getDb();

  try {
    const saved = await upsertPresentation(db, courseId, body);
    return NextResponse.json({ presentation: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "课件配置保存失败";
    if (error instanceof CoursePreviewNotFoundError) {
      return NextResponse.json({ message }, { status: 404 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
