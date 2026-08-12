import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { confirmCourseContent } from "@/lib/server/repositories/course-content";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await confirmCourseContent(getDb(), id)); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "内容确认失败" }, { status: 409 }); }
}
