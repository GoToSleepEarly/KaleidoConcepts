import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  getCourseResources,
} from "@/lib/server/repositories/course-images";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCourseResources(getDb(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource status loading failed", error);
    return NextResponse.json({ message: "资源状态加载失败" }, { status: 500 });
  }
}
