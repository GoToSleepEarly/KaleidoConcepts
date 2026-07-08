import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  createMissingCourseImages,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await createMissingCourseImages(getDb(), id);
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
