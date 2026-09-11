import { authenticatedUserId } from "@/lib/auth-cookie";
import { AI_GATEWAYS, IMAGE_BILLING_MODES, IMAGE_GENERATION_MODELS, IMAGE_QUALITIES, QUICKROUTER_ENDPOINTS, TEXT_GENERATION_MODELS, TEXT_REASONING_EFFORTS, imageQualityForSelection, isImageSelectionSupported, isTextTimeoutSettingsValid, type AccountAiSettings } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";
import type { AuthDb } from "@/lib/server/repositories/auth";

export class AiGatewayAuthenticationError extends Error {
  constructor() {
    super("登录状态已失效，请重新登录后继续");
    this.name = "AiGatewayAuthenticationError";
  }
}

export async function aiGatewayFromRequest(request: Request, db: { user: Pick<AuthDb["user"], "findUnique"> } = getDb()): Promise<AccountAiSettings> {
  const userId = authenticatedUserId(request);
  if (!userId) throw new AiGatewayAuthenticationError();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AiGatewayAuthenticationError();
  const timeoutSettings = {
    textStreamFirstEventTimeoutSeconds: user.textStreamFirstEventTimeoutSeconds as number,
    textStreamIdleTimeoutSeconds: user.textStreamIdleTimeoutSeconds as number,
    textStreamMaxDurationSeconds: user.textStreamMaxDurationSeconds as number,
    textNonStreamTimeoutSeconds: user.textNonStreamTimeoutSeconds as number,
  };
  if (!TEXT_GENERATION_MODELS.includes(user.writingProvider as AccountAiSettings["writingProvider"]) || !TEXT_REASONING_EFFORTS.includes(user.textReasoningEffort as AccountAiSettings["textReasoningEffort"]) || typeof user.textStreamingEnabled !== "boolean" || !isTextTimeoutSettingsValid(timeoutSettings) || !AI_GATEWAYS.includes(user.aiGateway as AccountAiSettings["aiGateway"]) || !QUICKROUTER_ENDPOINTS.includes(user.quickRouterEndpoint as AccountAiSettings["quickRouterEndpoint"]) || !IMAGE_GENERATION_MODELS.includes(user.imageModel as AccountAiSettings["imageModel"]) || !IMAGE_BILLING_MODES.includes(user.imageBillingMode as AccountAiSettings["imageBillingMode"]) || !IMAGE_QUALITIES.includes(user.imageQuality as AccountAiSettings["imageQuality"]) || !AI_GATEWAYS.includes(user.imageGateway as AccountAiSettings["imageGateway"]) || !QUICKROUTER_ENDPOINTS.includes(user.imageQuickRouterEndpoint as AccountAiSettings["imageQuickRouterEndpoint"]) || !isImageSelectionSupported(user.imageModel as AccountAiSettings["imageModel"], user.imageGateway as AccountAiSettings["imageGateway"], user.imageBillingMode as AccountAiSettings["imageBillingMode"])) {
    throw new Error("账户 AI 设置无效，请在高级设置中重新保存");
  }
  return {
    writingProvider: user.writingProvider as AccountAiSettings["writingProvider"],
    aiGateway: user.aiGateway as AccountAiSettings["aiGateway"],
    quickRouterEndpoint: user.quickRouterEndpoint as AccountAiSettings["quickRouterEndpoint"],
    imageModel: user.imageModel as AccountAiSettings["imageModel"],
    imageGateway: user.imageGateway as AccountAiSettings["imageGateway"],
    imageQuickRouterEndpoint: user.imageQuickRouterEndpoint as AccountAiSettings["imageQuickRouterEndpoint"],
    imageBillingMode: user.imageBillingMode as AccountAiSettings["imageBillingMode"],
    textReasoningEffort: user.textReasoningEffort as AccountAiSettings["textReasoningEffort"],
    textStreamingEnabled: user.textStreamingEnabled,
    ...timeoutSettings,
    imageQuality: imageQualityForSelection(user.imageModel as AccountAiSettings["imageModel"], user.imageGateway as AccountAiSettings["imageGateway"], user.imageBillingMode as AccountAiSettings["imageBillingMode"], user.imageQuality as AccountAiSettings["imageQuality"]),
  };
}
