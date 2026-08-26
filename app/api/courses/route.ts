import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { CourseGrammarSelectionError, CoursePersonValidationError, createCourse, listCourses } from "@/lib/server/repositories/courses";
import { courseAudienceSchema } from "@/lib/server/validation/courses";

export async function GET(request: Request) {
  try {
    const requestedPage = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const query = new URL(request.url).searchParams.get("query") ?? "";
    return NextResponse.json(await listCourses(getDb(), page, 5, query));
  } catch {
    return NextResponse.json({ message: "课程列表加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ message: "缺少课程创建请求标识" }, { status: 400 });
  const payload = courseAudienceSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "请完整填写课程名称、授课人物、时长、英语难度和知识点" }, { status: 400 });
  try {
    return NextResponse.json({ course: await createCourse(getDb(), payload.data, idempotencyKey) }, { status: 201 });
  } catch (error) {
    if (error instanceof CoursePersonValidationError) return NextResponse.json({ message: error.message }, { status: 409 });
    if (error instanceof CourseGrammarSelectionError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ message: "课程正在创建，请勿重复提交" }, { status: 409 });
    }
    return NextResponse.json({ message: "课程创建失败" }, { status: 500 });
  }
}
