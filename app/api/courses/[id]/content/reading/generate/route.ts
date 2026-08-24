import { NextResponse } from "next/server";
import { createCourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { hasCourseDownstream, runBeforeCourseDownstreamReset, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";
import { getDb } from "@/lib/server/db";
import { authenticationErrorResponse } from "@/lib/server/http/authentication";
import { CourseContentConflictError, CourseContentSupersededError, generateCourseReading, getCourseContentState } from "@/lib/server/repositories/course-content";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return NextResponse.json({ message: "缺少防重复请求标识" }, { status: 400 });
  const { id } = await params;
  const regenerate = new URL(request.url).searchParams.get("regenerate") === "true";
  const resetDownstream = new URL(request.url).searchParams.get("resetDownstream") === "true";
  try {
    const db = getDb();
    const aiGateway = await aiGatewayFromRequest(request, db);
    if (regenerate) {
      const downstreamDb = db as unknown as CourseDownstreamDb;
      const hasDownstream = await hasCourseDownstream(downstreamDb, id, "content");
      if (hasDownstream && !resetDownstream) return NextResponse.json({ message: "重新生成会删除已有的视觉资源、图片和预览发布设置", requiresReset: true }, { status: 409 });
      if (hasDownstream) {
        await runBeforeCourseDownstreamReset(downstreamDb, id, "content", () => generateCourseReading(db, id, key, createCourseContentGenerationDeps(aiGateway), { regenerate }));
        return NextResponse.json(await getCourseContentState(db, id));
      }
    }
    return NextResponse.json(await generateCourseReading(db, id, key, createCourseContentGenerationDeps(aiGateway), { regenerate }));
  }
  catch (error) {
    const authenticationResponse = authenticationErrorResponse(error);
    if (authenticationResponse) return authenticationResponse;
    if (error instanceof CourseContentConflictError || error instanceof CourseContentSupersededError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "正文生成失败" }, { status: 500 });
  }
}
