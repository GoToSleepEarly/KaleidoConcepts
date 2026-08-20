import { NextResponse } from "next/server";
import { z } from "zod";

import { createPersonVisualGenerationDeps } from "@/lib/server/ai/person-visual-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { PersonVisualInvalidStateError, refinePersonVisual } from "@/lib/server/repositories/person-visuals";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ message: "缺少生成请求标识" }, { status: 400 });
  const payload = z.object({ instruction: z.string().trim().min(1).max(500) }).safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "请输入要修改的内容" }, { status: 400 });
  const { id, assetId } = await params;
  try {
    const visual = await refinePersonVisual(getDb(), id, assetId, payload.data.instruction, idempotencyKey, createPersonVisualGenerationDeps(await aiGatewayFromRequest(request)));
    return NextResponse.json({ visual }, { status: visual.status === "succeeded" ? 201 : 502 });
  } catch (error) {
    if (error instanceof PersonVisualInvalidStateError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "人物形象修改失败" }, { status: 500 });
  }
}
