import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  confirmTeachingPlan,
  CourseTeachingPlanConflictError,
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
} from "@/lib/server/repositories/teaching-plan";
import { TeachingPlanValidationError } from "@/lib/server/validation/teaching-plan";
import { getCourseDownstreamImpact, withCourseDownstreamReset, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as { downstreamAction?: "check" | "preserve" | "clear" };
  const downstreamAction = body.downstreamAction ?? "check";
  if (!(["check", "preserve", "clear"] as const).includes(downstreamAction)) {
    return NextResponse.json({ message: "请选择如何处理后续内容" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const db = getDb();
    const result = downstreamAction === "clear"
      ? await withCourseDownstreamReset(db as unknown as CourseDownstreamDb, id, "teaching_plan", (tx) => confirmTeachingPlan(tx as unknown as Parameters<typeof confirmTeachingPlan>[0], id, "clear"))
      : await confirmTeachingPlan(db, id, downstreamAction);
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
