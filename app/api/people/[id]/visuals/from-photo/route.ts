import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createPersonVisualGenerationDeps } from "@/lib/server/ai/person-visual-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { authenticationErrorResponse } from "@/lib/server/http/authentication";
import { createPhotoVisual, PersonVisualNotFoundError } from "@/lib/server/repositories/person-visuals";
import { preparePersonPhoto } from "@/lib/server/storage/person-visuals";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ message: "缺少生成请求标识" }, { status: 400 });
  const { id } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ message: "请选择照片" }, { status: 400 });
    const prepared = await preparePersonPhoto(id, randomUUID(), file);
    const visual = await createPhotoVisual(
      getDb(),
      id,
      { ...prepared, customPrompt: String(formData.get("customPrompt") || "") },
      idempotencyKey,
      createPersonVisualGenerationDeps(await aiGatewayFromRequest(request)),
    );
    return NextResponse.json({ visual }, { status: visual.status === "succeeded" ? 201 : 502 });
  } catch (error) {
    const authenticationResponse = authenticationErrorResponse(error);
    if (authenticationResponse) return authenticationResponse;
    if (error instanceof PersonVisualNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "照片生成失败" }, { status: 500 });
  }
}
