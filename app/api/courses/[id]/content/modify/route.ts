import { NextResponse } from "next/server";
import { createCourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { authenticationErrorResponse } from "@/lib/server/http/authentication";
import { CourseContentConflictError, CourseContentSupersededError, getCourseContentState, modifyCourseContent } from "@/lib/server/repositories/course-content";
import { clearCourseAfterStage, hasCourseDownstream, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";
import { contentModifySchema } from "@/lib/server/validation/course-content";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("Idempotency-Key");
  const parsed = contentModifySchema.safeParse(await request.json());
  if (!key || !parsed.success) return NextResponse.json({ message: "请选择明确的修改范围并填写要求" }, { status: 400 });
  const { id } = await params;
  try {
    const db = getDb();
    const downstreamDb = db as unknown as CourseDownstreamDb;
    const hasDownstream = await hasCourseDownstream(downstreamDb, id, "content");
    const resetDownstream = new URL(request.url).searchParams.get("resetDownstream") === "true";
    if (hasDownstream && !resetDownstream) return NextResponse.json({ message: "修改成功后将重置视觉资源和预览发布", requiresReset: true }, { status: 409 });
    const settings = await aiGatewayFromRequest(request);
    const state = await modifyCourseContent(db, id, parsed.data, key, createCourseContentGenerationDeps(settings), { writingProvider: settings.writingProvider });
    if (hasDownstream) {
      await clearCourseAfterStage(downstreamDb, id, "content", "content");
      return NextResponse.json(await getCourseContentState(db, id));
    }
    return NextResponse.json(state);
  }
  catch (error) {
    const authenticationResponse = authenticationErrorResponse(error);
    if (authenticationResponse) return authenticationResponse;
    const status = error instanceof CourseContentConflictError || error instanceof CourseContentSupersededError ? 409 : 422;
    return NextResponse.json({ message: error instanceof Error ? error.message : "内容修改失败；原内容已保留" }, { status });
  }
}
