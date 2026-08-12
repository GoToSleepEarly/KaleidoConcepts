import { NextResponse } from "next/server";
import { createCourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { getDb } from "@/lib/server/db";
import { CourseContentConflictError, generateCourseReading } from "@/lib/server/repositories/course-content";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return NextResponse.json({ message: "缺少防重复请求标识" }, { status: 400 });
  const { id } = await params;
  const regenerate = new URL(request.url).searchParams.get("regenerate") === "true";
  try { return NextResponse.json(await generateCourseReading(getDb(), id, key, createCourseContentGenerationDeps(), { regenerate })); }
  catch (error) {
    if (error instanceof CourseContentConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "正文生成失败" }, { status: 500 });
  }
}
