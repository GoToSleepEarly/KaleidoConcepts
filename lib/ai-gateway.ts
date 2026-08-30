export const AI_GATEWAYS = ["quickrouter", "crazyrouter"] as const;

export type AiGateway = (typeof AI_GATEWAYS)[number];

export const QUICKROUTER_ENDPOINTS = ["main", "direct"] as const;
export type QuickRouterEndpoint = (typeof QUICKROUTER_ENDPOINTS)[number];

export type AiProviderSettings = {
  aiGateway: AiGateway;
  quickRouterEndpoint: QuickRouterEndpoint;
};

export const TEXT_GENERATION_MODELS = ["quickrouter_gpt", "quickrouter_deepseek"] as const;
export type TextGenerationModel = (typeof TEXT_GENERATION_MODELS)[number];

export type AccountAiSettings = AiProviderSettings & {
  writingProvider: TextGenerationModel;
};

export type AiProviderSettingsInput = AiGateway | AiProviderSettings;

export const quickRouterEndpointLabels: Record<QuickRouterEndpoint, string> = {
  main: "主站",
  direct: "直连",
};

export const quickRouterEndpointUrls: Record<QuickRouterEndpoint, string> = {
  main: "https://api.quickrouter.ai",
  direct: "https://api.quickrouter.us",
};

export function normalizeAiProviderSettings(input: AiProviderSettingsInput = "quickrouter"): AiProviderSettings {
  return typeof input === "string"
    ? { aiGateway: input, quickRouterEndpoint: "main" }
    : input;
}

export function aiProviderBaseUrl(input: AiProviderSettingsInput) {
  const settings = normalizeAiProviderSettings(input);
  return settings.aiGateway === "crazyrouter"
    ? "https://api.crazyrouter.com"
    : quickRouterEndpointUrls[settings.quickRouterEndpoint];
}

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
