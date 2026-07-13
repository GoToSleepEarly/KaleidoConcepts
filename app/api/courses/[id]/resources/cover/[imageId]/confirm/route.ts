import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  confirmCoverImage,
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;

  try {
    const result = await confirmCoverImage(getDb(), id, imageId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Cover image confirmation failed", error);
    return NextResponse.json({ message: "视觉封面确认失败" }, { status: 500 });
  }
}
