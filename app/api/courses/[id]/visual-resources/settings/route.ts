import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { updateCourseVisualSettings } from "@/lib/server/repositories/visual-resources";
import { visualSettingsSchema } from "@/lib/server/validation/visual-resources";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const input = visualSettingsSchema.parse(await request.json()); return NextResponse.json(await updateCourseVisualSettings(getDb(), id, input)); }
  catch (error) { return visualResourcesError(error); }
}
