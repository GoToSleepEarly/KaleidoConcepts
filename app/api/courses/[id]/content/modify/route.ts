import { NextResponse } from "next/server";
import { createCourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { CourseContentConflictError, CourseContentSupersededError, modifyCourseContent } from "@/lib/server/repositories/course-content";
import { contentModifySchema } from "@/lib/server/validation/course-content";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("Idempotency-Key");
  const parsed = contentModifySchema.safeParse(await request.json());
  if (!key || !parsed.success) return NextResponse.json({ message: "请选择明确的修改范围并填写要求" }, { status: 400 });
  const { id } = await params;
  try { return NextResponse.json(await modifyCourseContent(getDb(), id, parsed.data, key, createCourseContentGenerationDeps(await aiGatewayFromRequest(request)))); }
  catch (error) {
    const status = error instanceof CourseContentConflictError || error instanceof CourseContentSupersededError ? 409 : 422;
    return NextResponse.json({ message: error instanceof Error ? error.message : "内容修改失败；原内容已保留" }, { status });
  }
}
