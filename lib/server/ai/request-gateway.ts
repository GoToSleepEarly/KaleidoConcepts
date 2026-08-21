import { authenticatedUserId } from "@/lib/auth-cookie";
import type { AiGateway } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";
import type { AuthDb } from "@/lib/server/repositories/auth";

export class AiGatewayAuthenticationError extends Error {
  constructor() {
    super("登录状态已失效，请重新登录后继续");
    this.name = "AiGatewayAuthenticationError";
  }
}

export async function aiGatewayFromRequest(
  request: Request,
  db: { user: Pick<AuthDb["user"], "findUnique"> } = getDb(),
): Promise<AiGateway> {
  const userId = authenticatedUserId(request);
  if (!userId) throw new AiGatewayAuthenticationError();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AiGatewayAuthenticationError();
  return user.aiGateway;
}
