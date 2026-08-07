import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseAudienceConflictError,
  CourseNotFoundError,
  CoursePersonValidationError,
  getCourseAudience,
  updateCourseAudience,
} from "@/lib/server/repositories/courses";
import { courseAudienceSchema } from "@/lib/server/validation/courses";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ audience: await getCourseAudience(getDb(), id) });
  } catch (error) {
    if (error instanceof CourseNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "授课对象加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json();
  const parsed = courseAudienceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请完整填写课程名称、授课人物、时长、英语难度和知识点" }, { status: 400 });
  const resetDownstream = typeof body === "object" && body !== null && "resetDownstream" in body && body.resetDownstream === true;
  const { id } = await params;
  try {
    return NextResponse.json({ course: await updateCourseAudience(getDb(), id, parsed.data, resetDownstream) });
  } catch (error) {
    if (error instanceof CourseNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseAudienceConflictError) return NextResponse.json({ message: error.message, requiresReset: true }, { status: 409 });
    if (error instanceof CoursePersonValidationError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "授课对象保存失败" }, { status: 500 });
  }
}
