import { NextResponse } from "next/server";

import { createImageGenerationDeps } from "@/lib/server/ai/image-generation-deps";
import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  retryCourseImage,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;

  try {
    const result = await retryCourseImage(getDb(), id, imageId, createImageGenerationDeps());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource image retry failed", error);
    return NextResponse.json({ message: "图片重试失败" }, { status: 500 });
  }
}
