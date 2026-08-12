import { NextResponse } from "next/server";

import type { CoursePresentationUpdate } from "@/lib/contracts/api";
import { getDb } from "@/lib/server/db";
import { CoursePreviewNotFoundError, savePresentation } from "@/lib/server/repositories/course-preview";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const presentation = await savePresentation(getDb(), (await params).id, await request.json() as Partial<CoursePresentationUpdate>);
    return NextResponse.json({ presentation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "课件配置保存失败";
    return NextResponse.json({ message }, { status: error instanceof CoursePreviewNotFoundError ? 404 : 500 });
  }
}
