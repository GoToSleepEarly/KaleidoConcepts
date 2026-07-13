import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  type CourseImageGenerationScope,
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  createMissingCourseImages,
} from "@/lib/server/repositories/course-images";

function generationScope(body: unknown): CourseImageGenerationScope | null {
  const value = body as { scope?: unknown; slotId?: unknown; chapterId?: unknown } | null;
  if (value?.scope === "slot" && typeof value.slotId === "string" && value.slotId.trim()) {
    return { scope: "slot", slotId: value.slotId };
  }
  if ((value?.scope === "chapter" || !value?.scope) && typeof value?.chapterId === "string" && value.chapterId.trim()) {
    return { scope: "chapter", chapterId: value.chapterId };
  }
  if (value?.scope === "all") {
    return { scope: "all" };
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const scope = generationScope(await request.json().catch(() => null));
    if (!scope) {
      return NextResponse.json({ message: "请选择要生成的图片范围" }, { status: 400 });
    }

    const result = await createMissingCourseImages(getDb(), id, scope);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource generation task creation failed", error);
    return NextResponse.json({ message: "资源生成任务创建失败" }, { status: 500 });
  }
}
