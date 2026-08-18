import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { idempotencyKey, visualResourcesError } from "@/lib/server/http/visual-resources";
import { generateCourseVisualPlan } from "@/lib/server/repositories/visual-resources";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const requestId = idempotencyKey(request);
    return NextResponse.json(await generateCourseVisualPlan(getDb(), id, requestId));
  }
  catch (error) { return visualResourcesError(error); }
}
