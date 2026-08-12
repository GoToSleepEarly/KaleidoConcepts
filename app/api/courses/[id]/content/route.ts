import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { CourseContentNotFoundError, CourseContentPrerequisiteError, getCourseContentState } from "@/lib/server/repositories/course-content";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await getCourseContentState(getDb(), id)); }
  catch (error) {
    if (error instanceof CourseContentNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseContentPrerequisiteError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "文案与练习加载失败" }, { status: 500 });
  }
}
