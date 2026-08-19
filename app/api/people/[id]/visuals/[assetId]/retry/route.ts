import { NextResponse } from "next/server";

import { createPersonVisualGenerationDeps } from "@/lib/server/ai/person-visual-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { PersonVisualInvalidStateError, PersonVisualNotFoundError, retryPersonVisual } from "@/lib/server/repositories/person-visuals";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  try {
    const visual = await retryPersonVisual(getDb(), id, assetId, createPersonVisualGenerationDeps(aiGatewayFromRequest(request)));
    return NextResponse.json({ visual }, { status: visual.status === "succeeded" ? 200 : 502 });
  } catch (error) {
    if (error instanceof PersonVisualNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof PersonVisualInvalidStateError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "人物形象重试失败" }, { status: 500 });
  }
}
