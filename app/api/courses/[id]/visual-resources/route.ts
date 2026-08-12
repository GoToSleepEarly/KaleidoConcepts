import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { getCourseVisualResources } from "@/lib/server/repositories/visual-resources";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await getCourseVisualResources(getDb(), id)); }
  catch (error) { return visualResourcesError(error); }
}
