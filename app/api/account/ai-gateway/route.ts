import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedUserId } from "@/lib/auth-cookie";
import { AI_GATEWAYS, IMAGE_GENERATION_MODELS, QUICKROUTER_ENDPOINTS, TEXT_GENERATION_MODELS, isImageSelectionSupported } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";

const inputSchema = z
  .object({
    aiGateway: z.enum(AI_GATEWAYS),
    imageGateway: z.enum(AI_GATEWAYS).optional(),
    imageModel: z.enum(IMAGE_GENERATION_MODELS).optional(),
    imageQuickRouterEndpoint: z.enum(QUICKROUTER_ENDPOINTS).optional(),
    quickRouterEndpoint: z.enum(QUICKROUTER_ENDPOINTS).optional(),
    writingProvider: z.enum(TEXT_GENERATION_MODELS).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const user = await getDb().user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  return NextResponse.json({
    writingProvider: user.writingProvider,
    aiGateway: user.aiGateway,
    quickRouterEndpoint: user.quickRouterEndpoint,
    imageModel: user.imageModel,
    imageGateway: user.imageGateway,
    imageQuickRouterEndpoint: user.imageQuickRouterEndpoint,
  });
}

export async function PATCH(request: Request) {
  const id = authenticatedUserId(request);
  if (!id) return NextResponse.json({ message: "请重新登录后设置中转站" }, { status: 401 });
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ message: "中转站设置无效" }, { status: 400 });
  const db = getDb();
  const current = await db.user.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ message: "账号不存在" }, { status: 404 });
  const imageModel = input.data.imageModel ?? current.imageModel;
  const imageGateway = input.data.imageGateway ?? current.imageGateway;
  if (!isImageSelectionSupported(imageModel as (typeof IMAGE_GENERATION_MODELS)[number], imageGateway as (typeof AI_GATEWAYS)[number])) {
    return NextResponse.json({ message: "图片模型与调用线路不兼容" }, { status: 400 });
  }
  const user = await db.user.update({
    where: { id },
    data: {
      writingProvider: input.data.writingProvider ?? current.writingProvider,
      aiGateway: input.data.aiGateway,
      quickRouterEndpoint: input.data.quickRouterEndpoint ?? current.quickRouterEndpoint,
      imageModel,
      imageGateway,
      imageQuickRouterEndpoint: input.data.imageQuickRouterEndpoint ?? current.imageQuickRouterEndpoint,
    },
  });
  return NextResponse.json({
    writingProvider: user.writingProvider,
    aiGateway: user.aiGateway,
    quickRouterEndpoint: user.quickRouterEndpoint,
    imageModel: user.imageModel,
    imageGateway: user.imageGateway,
    imageQuickRouterEndpoint: user.imageQuickRouterEndpoint,
  });
}
