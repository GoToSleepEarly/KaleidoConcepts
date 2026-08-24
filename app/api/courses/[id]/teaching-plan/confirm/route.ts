import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  confirmTeachingPlan,
  CourseTeachingPlanConflictError,
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
} from "@/lib/server/repositories/teaching-plan";
import { TeachingPlanValidationError } from "@/lib/server/validation/teaching-plan";
import { getCourseDownstreamImpact, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";
import { parseTeachingPlan } from "@/lib/server/validation/teaching-plan";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as { downstreamAction?: "check" | "preserve"; plan?: unknown };
  const downstreamAction = body.downstreamAction ?? "check";
  if (!(["check", "preserve"] as const).includes(downstreamAction)) {
    return NextResponse.json({ message: "请选择如何处理后续内容" }, { status: 400 });
  }
  let plan;
  try {
    plan = body.plan === undefined ? undefined : parseTeachingPlan(body.plan);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "教学规划信息不完整" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const db = getDb();
    const result = await confirmTeachingPlan(db, id, downstreamAction, plan);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError || error instanceof TeachingPlanValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CourseTeachingPlanConflictError) {
      const affectedResources = await getCourseDownstreamImpact(getDb() as unknown as CourseDownstreamDb, id, "teaching_plan");
      return NextResponse.json({ message: error.message, requiresReset: true, affectedResources }, { status: 409 });
    }
    return NextResponse.json({ message: "教学规划确认失败" }, { status: 500 });
  }
}
