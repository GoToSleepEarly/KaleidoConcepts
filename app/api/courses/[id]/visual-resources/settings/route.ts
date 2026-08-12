import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { updateCourseVisualQuality } from "@/lib/server/repositories/visual-resources";
import { visualQualitySchema } from "@/lib/server/validation/visual-resources";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const input = visualQualitySchema.parse(await request.json()); return NextResponse.json(await updateCourseVisualQuality(getDb(), id, input.quality)); }
  catch (error) { return visualResourcesError(error); }
}
