import { NextResponse } from "next/server";

import { mockCourse } from "@/lib/mock-course-data";
import { getDb } from "@/lib/server/db";
import { CourseNotFoundError, deleteCourse } from "@/lib/server/repositories/courses";
import { removeCourseImageDirectory } from "@/lib/server/storage/course-images";

export async function GET() {
  return NextResponse.json({ course: mockCourse });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await deleteCourse(getDb(), id);

    try {
      await removeCourseImageDirectory(id);
    } catch (cleanupError) {
      console.error("Course image directory cleanup failed", cleanupError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CourseNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    console.error("Course deletion failed", error);
    return NextResponse.json({ message: "课程删除失败" }, { status: 500 });
  }
}
