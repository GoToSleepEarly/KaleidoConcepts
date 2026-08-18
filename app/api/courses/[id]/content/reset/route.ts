import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { resetCourseContent } from "@/lib/server/repositories/course-content";
import { withCourseDownstreamReset, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const state = await withCourseDownstreamReset(db as unknown as CourseDownstreamDb, id, "content", (tx) => resetCourseContent(tx as unknown as Parameters<typeof resetCourseContent>[0], id));
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "重新开始文案与练习失败" }, { status: 500 });
  }
}
