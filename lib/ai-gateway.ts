export const AI_GATEWAYS = ["quickrouter", "crazyrouter"] as const;

export type AiGateway = (typeof AI_GATEWAYS)[number];

export function parseAiGateway(value: unknown): AiGateway {
  return value === "crazyrouter" ? value : "quickrouter";
}

export const aiGatewayLabels: Record<AiGateway, string> = {
  quickrouter: "QuickRouter",
  crazyrouter: "Crazyrouter",
};

export const aiGatewayDescriptions: Record<AiGateway, string> = {
  quickrouter: "图片限流时可使用 QuickRouter 专属备用模型。",
  crazyrouter: "使用同一中转站处理 GPT 文本、联网研究、图片生成与编辑。",
};
