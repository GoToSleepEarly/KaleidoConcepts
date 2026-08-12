import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { selectCourseVisualAsset } from "@/lib/server/repositories/visual-resources";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  try { return NextResponse.json(await selectCourseVisualAsset(getDb(), id, assetId)); }
  catch (error) { return visualResourcesError(error); }
}
