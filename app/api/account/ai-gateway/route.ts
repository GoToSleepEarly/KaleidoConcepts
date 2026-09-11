import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticatedUserId } from "@/lib/auth-cookie";
import { AI_GATEWAYS, IMAGE_BILLING_MODES, IMAGE_GENERATION_MODELS, IMAGE_QUALITIES, QUICKROUTER_ENDPOINTS, TEXT_GENERATION_MODELS, TEXT_REASONING_EFFORTS, TEXT_TIMEOUT_LIMITS, defaultTextTimeoutSettings, imageQualityForSelection, isImageSelectionSupported, isTextTimeoutSettingsValid } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";

const inputSchema = z
  .object({
    aiGateway: z.enum(AI_GATEWAYS),
    imageGateway: z.enum(AI_GATEWAYS).optional(),
    imageModel: z.enum(IMAGE_GENERATION_MODELS).optional(),
    imageBillingMode: z.enum(IMAGE_BILLING_MODES).optional(),
    imageQuickRouterEndpoint: z.enum(QUICKROUTER_ENDPOINTS).optional(),
    quickRouterEndpoint: z.enum(QUICKROUTER_ENDPOINTS).optional(),
    writingProvider: z.enum(TEXT_GENERATION_MODELS).optional(),
    textReasoningEffort: z.enum(TEXT_REASONING_EFFORTS).optional(),
    textStreamingEnabled: z.boolean().optional(),
    textStreamFirstEventTimeoutSeconds: z.number().int().min(TEXT_TIMEOUT_LIMITS.streamFirstEventSeconds.min).max(TEXT_TIMEOUT_LIMITS.streamFirstEventSeconds.max).optional(),
    textStreamIdleTimeoutSeconds: z.number().int().min(TEXT_TIMEOUT_LIMITS.streamIdleSeconds.min).max(TEXT_TIMEOUT_LIMITS.streamIdleSeconds.max).optional(),
    textStreamMaxDurationSeconds: z.number().int().min(TEXT_TIMEOUT_LIMITS.streamMaxDurationSeconds.min).max(TEXT_TIMEOUT_LIMITS.streamMaxDurationSeconds.max).optional(),
    textNonStreamTimeoutSeconds: z.number().int().min(TEXT_TIMEOUT_LIMITS.nonStreamSeconds.min).max(TEXT_TIMEOUT_LIMITS.nonStreamSeconds.max).optional(),
    imageQuality: z.enum(IMAGE_QUALITIES).optional(),
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
    imageBillingMode: user.imageBillingMode,
    textReasoningEffort: user.textReasoningEffort,
    textStreamingEnabled: user.textStreamingEnabled,
    textStreamFirstEventTimeoutSeconds: user.textStreamFirstEventTimeoutSeconds,
    textStreamIdleTimeoutSeconds: user.textStreamIdleTimeoutSeconds,
    textStreamMaxDurationSeconds: user.textStreamMaxDurationSeconds,
    textNonStreamTimeoutSeconds: user.textNonStreamTimeoutSeconds,
    imageQuality: user.imageQuality,
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
  const imageBillingMode = input.data.imageBillingMode ?? current.imageBillingMode;
  const timeoutDefaults = defaultTextTimeoutSettings();
  const timeoutSettings = {
    textStreamFirstEventTimeoutSeconds: input.data.textStreamFirstEventTimeoutSeconds ?? current.textStreamFirstEventTimeoutSeconds ?? timeoutDefaults.textStreamFirstEventTimeoutSeconds,
    textStreamIdleTimeoutSeconds: input.data.textStreamIdleTimeoutSeconds ?? current.textStreamIdleTimeoutSeconds ?? timeoutDefaults.textStreamIdleTimeoutSeconds,
    textStreamMaxDurationSeconds: input.data.textStreamMaxDurationSeconds ?? current.textStreamMaxDurationSeconds ?? timeoutDefaults.textStreamMaxDurationSeconds,
    textNonStreamTimeoutSeconds: input.data.textNonStreamTimeoutSeconds ?? current.textNonStreamTimeoutSeconds ?? timeoutDefaults.textNonStreamTimeoutSeconds,
  };
  if (!isImageSelectionSupported(imageModel as (typeof IMAGE_GENERATION_MODELS)[number], imageGateway as (typeof AI_GATEWAYS)[number], imageBillingMode as (typeof IMAGE_BILLING_MODES)[number])) {
    return NextResponse.json({ message: "图片模型与调用线路不兼容" }, { status: 400 });
  }
  const imageQuality = imageQualityForSelection(imageModel as (typeof IMAGE_GENERATION_MODELS)[number], imageGateway as (typeof AI_GATEWAYS)[number], imageBillingMode as (typeof IMAGE_BILLING_MODES)[number], (input.data.imageQuality ?? current.imageQuality) as (typeof IMAGE_QUALITIES)[number]);
  if (!isTextTimeoutSettingsValid(timeoutSettings)) {
    return NextResponse.json({ message: "文本超时设置无效：最长运行时间必须大于首个响应和事件空闲时间" }, { status: 400 });
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
      imageBillingMode,
      textReasoningEffort: input.data.textReasoningEffort ?? current.textReasoningEffort,
      textStreamingEnabled: input.data.textStreamingEnabled ?? current.textStreamingEnabled,
      ...timeoutSettings,
      imageQuality,
    },
  });
  return NextResponse.json({
    writingProvider: user.writingProvider,
    aiGateway: user.aiGateway,
    quickRouterEndpoint: user.quickRouterEndpoint,
    imageModel: user.imageModel,
    imageGateway: user.imageGateway,
    imageQuickRouterEndpoint: user.imageQuickRouterEndpoint,
    imageBillingMode: user.imageBillingMode,
    textReasoningEffort: user.textReasoningEffort,
    textStreamingEnabled: user.textStreamingEnabled,
    textStreamFirstEventTimeoutSeconds: user.textStreamFirstEventTimeoutSeconds,
    textStreamIdleTimeoutSeconds: user.textStreamIdleTimeoutSeconds,
    textStreamMaxDurationSeconds: user.textStreamMaxDurationSeconds,
    textNonStreamTimeoutSeconds: user.textNonStreamTimeoutSeconds,
    imageQuality: user.imageQuality,
  });
}
