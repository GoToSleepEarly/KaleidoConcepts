import { NextResponse } from "next/server";

import { createImageGenerationDeps } from "@/lib/server/ai/image-generation-deps";
import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  createCoverImage,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await createCoverImage(getDb(), id, createImageGenerationDeps());
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Cover image generation failed", error);
    return NextResponse.json({ message: "视觉封面生成失败" }, { status: 500 });
  }
}
