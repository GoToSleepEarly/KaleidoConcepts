import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { CourseContentPrerequisiteError, resetCourseContent } from "@/lib/server/repositories/course-content";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const state = await resetCourseContent(db, id);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof CourseContentPrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "重新开始文案与练习失败" }, { status: 500 });
  }
}
