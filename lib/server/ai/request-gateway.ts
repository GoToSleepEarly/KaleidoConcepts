import { AI_GATEWAY_COOKIE, AUTH_USER_COOKIE, parseAiGateway, type AiGateway } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";
import type { AuthDb } from "@/lib/server/repositories/auth";

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function aiGatewayFromRequest(
  request: Request,
  db: { user: Pick<AuthDb["user"], "findUnique"> } = getDb(),
): Promise<AiGateway> {
  const encodedUserId = cookieValue(request, AUTH_USER_COOKIE);
  if (encodedUserId) {
    const user = await db.user.findUnique({ where: { id: decodeURIComponent(encodedUserId) } });
    if (user) return user.aiGateway;
  }

  const encodedGateway = cookieValue(request, AI_GATEWAY_COOKIE);
  return parseAiGateway(encodedGateway ? decodeURIComponent(encodedGateway) : undefined);
}
