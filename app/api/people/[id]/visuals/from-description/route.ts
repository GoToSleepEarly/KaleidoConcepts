import { NextResponse } from "next/server";
import { z } from "zod";

import { createPersonVisualGenerationDeps } from "@/lib/server/ai/person-visual-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { createDescriptionVisual, PersonVisualNotFoundError } from "@/lib/server/repositories/person-visuals";

const schema = z.object({
  appearanceConfig: z.object({
    hairstyle: z.string().max(50).optional(),
    hairColor: z.string().max(50).optional(),
    faceShape: z.string().max(50).optional(),
    bodyShape: z.string().max(50).optional(),
    glasses: z.string().max(50).optional(),
    temperament: z.string().max(50).optional(),
    outfitStyle: z.string().max(50).optional(),
    outfitColor: z.string().max(50).optional(),
    signatureFeature: z.string().max(100).optional(),
  }),
  customPrompt: z.string().max(500).default(""),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ message: "缺少生成请求标识" }, { status: 400 });
  const payload = schema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "形象描述无效" }, { status: 400 });
  const { id } = await params;
  try {
    const visual = await createDescriptionVisual(getDb(), id, payload.data, idempotencyKey, createPersonVisualGenerationDeps(await aiGatewayFromRequest(request)));
    return NextResponse.json({ visual }, { status: visual.status === "succeeded" ? 201 : 502 });
  } catch (error) {
    if (error instanceof PersonVisualNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "人物形象生成失败" }, { status: 500 });
  }
}
