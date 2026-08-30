import { NextResponse } from "next/server";
import { z } from "zod";
import { createCourseContentGenerationDeps } from "@/lib/server/ai/course-content-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { authenticationErrorResponse } from "@/lib/server/http/authentication";
import { CourseContentConflictError, CourseContentSupersededError, generateCourseExercises, generateCourseReading } from "@/lib/server/repositories/course-content";

const retrySchema = z.object({ operation: z.enum(["reading", "exercises"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = request.headers.get("Idempotency-Key");
  const parsed = retrySchema.safeParse(await request.json());
  if (!key || !parsed.success) return NextResponse.json({ message: "请选择要重试的失败阶段" }, { status: 400 });
  const { id } = await params;
  try {
    const settings = await aiGatewayFromRequest(request);
    const deps = createCourseContentGenerationDeps(settings);
    const options = { writingProvider: settings.writingProvider };
    return NextResponse.json(parsed.data.operation === "reading" ? await generateCourseReading(getDb(), id, key, deps, options) : await generateCourseExercises(getDb(), id, key, deps, options));
  } catch (error) {
    const authenticationResponse = authenticationErrorResponse(error);
    if (authenticationResponse) return authenticationResponse;
    const status = error instanceof CourseContentConflictError || error instanceof CourseContentSupersededError ? 409 : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "重试失败" }, { status });
  }
}
