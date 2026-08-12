import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { confirmVisualResources, CoursePreviewNotFoundError, CoursePreviewPrerequisiteError } from "@/lib/server/repositories/course-preview";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await confirmVisualResources(getDb(), (await params).id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法进入预览发布";
    return NextResponse.json({ message }, { status: error instanceof CoursePreviewNotFoundError ? 404 : error instanceof CoursePreviewPrerequisiteError ? 400 : 500 });
  }
}
