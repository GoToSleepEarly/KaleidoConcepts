import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
  resetTeachingPlan,
} from "@/lib/server/repositories/teaching-plan";
import { markCourseDownstreamStale, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const plan = await resetTeachingPlan(db, id);
    await markCourseDownstreamStale(db as unknown as CourseDownstreamDb, id, "teaching_plan");
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ message: "教学规划重置失败，请重试。" }, { status: 500 });
  }
}
