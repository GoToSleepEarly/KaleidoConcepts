export const AI_GATEWAYS = ["quickrouter", "crazyrouter", "easy88ai"] as const;
export type AiGateway = (typeof AI_GATEWAYS)[number];

export const QUICKROUTER_ENDPOINTS = ["main", "direct"] as const;
export type QuickRouterEndpoint = (typeof QUICKROUTER_ENDPOINTS)[number];

export const TEXT_GENERATION_MODELS = ["gpt-5.5", "gpt-5.6-sol", "deepseek-v4-pro"] as const;
export type TextGenerationModel = (typeof TEXT_GENERATION_MODELS)[number];

export const IMAGE_GENERATION_MODELS = ["gpt-image-2", "gpt-image-2-c"] as const;
export type ImageGenerationModel = (typeof IMAGE_GENERATION_MODELS)[number];

export type AiProviderSettings = {
  aiGateway: AiGateway;
  quickRouterEndpoint: QuickRouterEndpoint;
};

export type ImageProviderSettings = AiProviderSettings & {
  imageModel: ImageGenerationModel;
};

export type AccountAiSettings = {
  writingProvider: TextGenerationModel;
  aiGateway: AiGateway;
  quickRouterEndpoint: QuickRouterEndpoint;
  imageModel: ImageGenerationModel;
  imageGateway: AiGateway;
  imageQuickRouterEndpoint: QuickRouterEndpoint;
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

export const aiGatewayLabels: Record<AiGateway, string> = {
  quickrouter: "QuickRouter",
  crazyrouter: "Crazyrouter",
  easy88ai: "Easy88AI",
};

export const textModelLabels: Record<TextGenerationModel, string> = {
  "gpt-5.5": "GPT-5.5",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
};

export const imageModelLabels: Record<ImageGenerationModel, string> = {
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-c": "GPT Image 2-C",
};

export const aiGatewayDescriptions: Record<AiGateway, string> = {
  quickrouter: "支持主站与直连两条预置线路。",
  crazyrouter: "使用 Crazyrouter 的 OpenAI 兼容接口。",
  easy88ai: "使用 Easy88AI 的 OpenAI 兼容接口。",
};

const gatewayBaseUrls: Record<Exclude<AiGateway, "quickrouter">, string> = {
  crazyrouter: "https://api.crazyrouter.com",
  easy88ai: "https://api.easy88ai.com",
};

export type TextModelAliases = Partial<Record<AiGateway, Partial<Record<TextGenerationModel, string>>>>;

// Only add an entry after the gateway's free model-list endpoint or official docs prove
// that its upstream name differs from the product's canonical model name.
export const textModelAliases: TextModelAliases = {};

export function normalizeAiProviderSettings(input: AiProviderSettingsInput = "quickrouter"): AiProviderSettings {
  return typeof input === "string" ? { aiGateway: input, quickRouterEndpoint: "main" } : input;
}

export function aiProviderBaseUrl(input: AiProviderSettingsInput) {
  const settings = normalizeAiProviderSettings(input);
  return settings.aiGateway === "quickrouter" ? quickRouterEndpointUrls[settings.quickRouterEndpoint] : gatewayBaseUrls[settings.aiGateway];
}

export function upstreamTextModel(model: TextGenerationModel, gateway: AiGateway, aliases: TextModelAliases = textModelAliases) {
  return aliases[gateway]?.[model] ?? model;
}

export function upstreamImageModel(model: ImageGenerationModel, gateway: AiGateway) {
  if (model === "gpt-image-2-c" && gateway !== "quickrouter") {
    throw new Error("GPT Image 2-C 仅支持 QuickRouter");
  }
  return model;
}

export function isImageSelectionSupported(model: ImageGenerationModel, gateway: AiGateway) {
  return model !== "gpt-image-2-c" || gateway === "quickrouter";
}

export function parseAiGateway(value: unknown): AiGateway {
  return AI_GATEWAYS.includes(value as AiGateway) ? (value as AiGateway) : "quickrouter";
}

export function textProviderSettings(settings: AccountAiSettings): AiProviderSettings {
  return {
    aiGateway: settings.aiGateway,
    quickRouterEndpoint: settings.quickRouterEndpoint,
  };
}

export function imageProviderSettings(settings: AccountAiSettings): ImageProviderSettings {
  return {
    aiGateway: settings.imageGateway,
    quickRouterEndpoint: settings.imageQuickRouterEndpoint,
    imageModel: settings.imageModel,
  };
}
