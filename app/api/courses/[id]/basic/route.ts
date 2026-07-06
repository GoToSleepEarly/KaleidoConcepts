import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, getCourseBasic, updateCourseBasic } from "@/lib/server/repositories/courses";
import { courseBasicInputSchema } from "@/lib/server/validation/course-basic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const course = await getCourseBasic(getDb(), id);

    if (!course) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    return NextResponse.json({ course });
  } catch {
    return NextResponse.json({ message: "课程基础信息加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = courseBasicInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "课程基础信息不完整" }, { status: 400 });
  }

  try {
    const course = await updateCourseBasic(getDb(), id, payload.data);
    return NextResponse.json({ course });
  } catch (error) {
    if (error instanceof CourseBasicValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (typeof error === "object" && error && "code" in error && error.code === "P2025") {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "课程基础信息保存失败" }, { status: 500 });
  }
}
