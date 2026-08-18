import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
  resetTeachingPlan,
} from "@/lib/server/repositories/teaching-plan";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ plan: await resetTeachingPlan(getDb(), id) });
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ message: "教学规划重置失败，请重试。" }, { status: 500 });
  }
}
