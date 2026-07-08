import { NextResponse } from "next/server";

import { createTencentHunyuanImageClient } from "@/lib/server/ai/tencent-hunyuan-image";
import { getDb } from "@/lib/server/db";
import {
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  getCourseResourcesAndAdvance,
} from "@/lib/server/repositories/course-images";
import { downloadCourseImage } from "@/lib/server/storage/course-images";

function queueDeps() {
  return {
    provider: createTencentHunyuanImageClient(),
    download: downloadCourseImage,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCourseResourcesAndAdvance(getDb(), id, queueDeps());
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
