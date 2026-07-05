import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, createCourseBasic, listCourses } from "@/lib/server/repositories/courses";
import { courseBasicInputSchema } from "@/lib/server/validation/course-basic";

export async function GET() {
  try {
    const courses = await listCourses(getDb());
    return NextResponse.json({ courses });
  } catch {
    return NextResponse.json({ message: "课程列表加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = courseBasicInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "课程基础信息不完整" }, { status: 400 });
  }

  try {
    const course = await createCourseBasic(getDb(), payload.data);
    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    if (error instanceof CourseBasicValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "课程创建失败" }, { status: 500 });
  }
}
