import { NextResponse } from "next/server";

import { createCourseVisualPlanDeps } from "@/lib/server/ai/course-visual-plan-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { idempotencyKey, visualResourcesError } from "@/lib/server/http/visual-resources";
import { generateCourseVisualPlan } from "@/lib/server/repositories/visual-resources";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const requestId = idempotencyKey(request);
    return NextResponse.json(await generateCourseVisualPlan(getDb(), (await params).id, requestId, createCourseVisualPlanDeps(await aiGatewayFromRequest(request)), "originalized"));
  }
  catch (error) { return visualResourcesError(error); }
}
