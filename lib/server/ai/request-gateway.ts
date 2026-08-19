import { AI_GATEWAY_COOKIE, parseAiGateway, type AiGateway } from "@/lib/ai-gateway";

export function aiGatewayFromRequest(request: Request): AiGateway {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === AI_GATEWAY_COOKIE)?.[1];
  return parseAiGateway(value ? decodeURIComponent(value) : undefined);
}
