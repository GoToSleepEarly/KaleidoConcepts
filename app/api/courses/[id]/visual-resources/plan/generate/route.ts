import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { generateCourseVisualPlan } from "@/lib/server/repositories/visual-resources";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await generateCourseVisualPlan(getDb(), id)); }
  catch (error) { return visualResourcesError(error); }
}
