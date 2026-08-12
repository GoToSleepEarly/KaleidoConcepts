import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { resetCourseContent } from "@/lib/server/repositories/course-content";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await resetCourseContent(getDb(), id));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "重新开始 Step 4 失败" }, { status: 500 });
  }
}
