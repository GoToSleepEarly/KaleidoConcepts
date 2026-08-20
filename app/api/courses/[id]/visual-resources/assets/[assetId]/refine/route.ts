import { NextResponse } from "next/server";
import { createCourseImageGenerationDeps } from "@/lib/server/ai/course-image-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { idempotencyKey, visualResourcesError } from "@/lib/server/http/visual-resources";
import { refineCourseVisualAsset } from "@/lib/server/repositories/visual-resources";
import { visualRefineSchema } from "@/lib/server/validation/visual-resources";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  try {
    const input = visualRefineSchema.parse(await request.json());
    return NextResponse.json(await refineCourseVisualAsset(getDb(), id, assetId, input.instruction, idempotencyKey(request), createCourseImageGenerationDeps(await aiGatewayFromRequest(request))));
  } catch (error) { return visualResourcesError(error); }
}
