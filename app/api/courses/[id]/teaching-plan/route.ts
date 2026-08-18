import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseTeachingPlanNotFoundError,
  CourseTeachingPlanPrerequisiteError,
  getTeachingPlanState,
  saveTeachingPlan,
} from "@/lib/server/repositories/teaching-plan";
import { parseTeachingPlan, TeachingPlanValidationError } from "@/lib/server/validation/teaching-plan";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await getTeachingPlanState(getDb(), id));
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ message: "教学规划加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  let plan;
  try {
    plan = parseTeachingPlan(typeof body === "object" && body !== null && "plan" in body ? body.plan : body);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "教学规划信息不完整" }, { status: 400 });
  }

  const { id } = await params;
  try {
    return NextResponse.json({ plan: await saveTeachingPlan(getDb(), id, plan) });
  } catch (error) {
    if (error instanceof CourseTeachingPlanNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseTeachingPlanPrerequisiteError || error instanceof TeachingPlanValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "保存失败，请重试。" }, { status: 500 });
  }
}
