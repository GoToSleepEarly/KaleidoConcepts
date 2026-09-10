import { authenticatedUserId } from "@/lib/auth-cookie";
import { AI_GATEWAYS, IMAGE_GENERATION_MODELS, QUICKROUTER_ENDPOINTS, TEXT_GENERATION_MODELS, isImageSelectionSupported, type AccountAiSettings } from "@/lib/ai-gateway";
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
  if (!TEXT_GENERATION_MODELS.includes(user.writingProvider as AccountAiSettings["writingProvider"]) || !AI_GATEWAYS.includes(user.aiGateway as AccountAiSettings["aiGateway"]) || !QUICKROUTER_ENDPOINTS.includes(user.quickRouterEndpoint as AccountAiSettings["quickRouterEndpoint"]) || !IMAGE_GENERATION_MODELS.includes(user.imageModel as AccountAiSettings["imageModel"]) || !AI_GATEWAYS.includes(user.imageGateway as AccountAiSettings["imageGateway"]) || !QUICKROUTER_ENDPOINTS.includes(user.imageQuickRouterEndpoint as AccountAiSettings["imageQuickRouterEndpoint"]) || !isImageSelectionSupported(user.imageModel as AccountAiSettings["imageModel"], user.imageGateway as AccountAiSettings["imageGateway"])) {
    throw new Error("账户 AI 设置无效，请在高级设置中重新保存");
  }
  return {
    writingProvider: user.writingProvider as AccountAiSettings["writingProvider"],
    aiGateway: user.aiGateway as AccountAiSettings["aiGateway"],
    quickRouterEndpoint: user.quickRouterEndpoint as AccountAiSettings["quickRouterEndpoint"],
    imageModel: user.imageModel as AccountAiSettings["imageModel"],
    imageGateway: user.imageGateway as AccountAiSettings["imageGateway"],
    imageQuickRouterEndpoint: user.imageQuickRouterEndpoint as AccountAiSettings["imageQuickRouterEndpoint"],
  };
}
