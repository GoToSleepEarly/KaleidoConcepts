import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  confirmTeachingPlan,
  CourseTeachingPlanConflictError,
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
} from "@/lib/server/repositories/teaching-plan";
import { TeachingPlanValidationError } from "@/lib/server/validation/teaching-plan";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as { resetDownstream?: boolean };
  const { id } = await params;
  try {
    return NextResponse.json(await confirmTeachingPlan(getDb(), id, body.resetDownstream === true));
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError || error instanceof TeachingPlanValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CourseTeachingPlanConflictError) {
      return NextResponse.json({ message: error.message, requiresReset: true }, { status: 409 });
    }
    return NextResponse.json({ message: "教学规划确认失败" }, { status: 500 });
  }
}
