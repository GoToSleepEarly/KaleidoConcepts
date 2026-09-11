export const AI_GATEWAYS = ["quickrouter", "crazyrouter", "easy88ai"] as const;
export type AiGateway = (typeof AI_GATEWAYS)[number];

export const QUICKROUTER_ENDPOINTS = ["main", "direct"] as const;
export type QuickRouterEndpoint = (typeof QUICKROUTER_ENDPOINTS)[number];

export const TEXT_GENERATION_MODELS = ["gpt-5.5", "gpt-5.6-sol", "deepseek-v4-pro"] as const;
export type TextGenerationModel = (typeof TEXT_GENERATION_MODELS)[number];

export const TEXT_REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type TextReasoningEffort = (typeof TEXT_REASONING_EFFORTS)[number];

export const TEXT_TIMEOUT_DEFAULTS = {
  streamFirstEventSeconds: 120,
  streamIdleSeconds: 180,
  streamMaxDurationSeconds: 1_200,
  nonStreamSeconds: 600,
} as const;

export const TEXT_TIMEOUT_LIMITS = {
  streamFirstEventSeconds: { min: 10, max: 600 },
  streamIdleSeconds: { min: 10, max: 600 },
  streamMaxDurationSeconds: { min: 300, max: 3_600 },
  nonStreamSeconds: { min: 60, max: 1_800 },
} as const;

export type TextTimeoutSettings = {
  textStreamFirstEventTimeoutSeconds: number;
  textStreamIdleTimeoutSeconds: number;
  textStreamMaxDurationSeconds: number;
  textNonStreamTimeoutSeconds: number;
};

export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const IMAGE_GENERATION_MODELS = ["gpt-image-2", "gpt-image-2-c"] as const;
export type ImageGenerationModel = (typeof IMAGE_GENERATION_MODELS)[number];

export type AiProviderSettings = {
  aiGateway: AiGateway;
  quickRouterEndpoint: QuickRouterEndpoint;
};

export type ImageProviderSettings = AiProviderSettings & {
  imageModel: ImageGenerationModel;
  imageQuality: ImageQuality;
};

export type TextProviderSettings = AiProviderSettings & {
  textReasoningEffort: TextReasoningEffort;
  textStreamingEnabled: boolean;
} & TextTimeoutSettings;

export type AccountAiSettings = {
  writingProvider: TextGenerationModel;
  aiGateway: AiGateway;
  quickRouterEndpoint: QuickRouterEndpoint;
  imageModel: ImageGenerationModel;
  imageGateway: AiGateway;
  imageQuickRouterEndpoint: QuickRouterEndpoint;
  textReasoningEffort: TextReasoningEffort;
  textStreamingEnabled: boolean;
  textStreamFirstEventTimeoutSeconds: number;
  textStreamIdleTimeoutSeconds: number;
  textStreamMaxDurationSeconds: number;
  textNonStreamTimeoutSeconds: number;
  imageQuality: ImageQuality;
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

export const textReasoningEffortLabels: Record<TextReasoningEffort, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const imageQualityLabels: Record<ImageQuality, string> = {
  low: "中",
  medium: "高",
  high: "极高",
};

const textModelCapabilities: Record<TextGenerationModel, { reasoningEfforts: readonly TextReasoningEffort[] }> = {
  "gpt-5.5": { reasoningEfforts: TEXT_REASONING_EFFORTS },
  "gpt-5.6-sol": { reasoningEfforts: TEXT_REASONING_EFFORTS },
  "deepseek-v4-pro": { reasoningEfforts: TEXT_REASONING_EFFORTS },
};

export function reasoningEffortsForModel(model: TextGenerationModel) {
  return [...textModelCapabilities[model].reasoningEfforts];
}

export function imageQualityForSelection(model: ImageGenerationModel, requested: ImageQuality): ImageQuality {
  return model === "gpt-image-2-c" ? "high" : requested;
}

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

export function textProviderSettings(settings: AccountAiSettings): TextProviderSettings {
  return {
    aiGateway: settings.aiGateway,
    quickRouterEndpoint: settings.quickRouterEndpoint,
    textReasoningEffort: settings.textReasoningEffort,
    textStreamingEnabled: settings.textStreamingEnabled,
    textStreamFirstEventTimeoutSeconds: settings.textStreamFirstEventTimeoutSeconds,
    textStreamIdleTimeoutSeconds: settings.textStreamIdleTimeoutSeconds,
    textStreamMaxDurationSeconds: settings.textStreamMaxDurationSeconds,
    textNonStreamTimeoutSeconds: settings.textNonStreamTimeoutSeconds,
  };
}

export function defaultTextTimeoutSettings(): TextTimeoutSettings {
  return {
    textStreamFirstEventTimeoutSeconds: TEXT_TIMEOUT_DEFAULTS.streamFirstEventSeconds,
    textStreamIdleTimeoutSeconds: TEXT_TIMEOUT_DEFAULTS.streamIdleSeconds,
    textStreamMaxDurationSeconds: TEXT_TIMEOUT_DEFAULTS.streamMaxDurationSeconds,
    textNonStreamTimeoutSeconds: TEXT_TIMEOUT_DEFAULTS.nonStreamSeconds,
  };
}

export function isTextTimeoutSettingsValid(settings: TextTimeoutSettings) {
  const inRange = (value: number, limits: { min: number; max: number }) => Number.isInteger(value) && value >= limits.min && value <= limits.max;
  return inRange(settings.textStreamFirstEventTimeoutSeconds, TEXT_TIMEOUT_LIMITS.streamFirstEventSeconds)
    && inRange(settings.textStreamIdleTimeoutSeconds, TEXT_TIMEOUT_LIMITS.streamIdleSeconds)
    && inRange(settings.textStreamMaxDurationSeconds, TEXT_TIMEOUT_LIMITS.streamMaxDurationSeconds)
    && inRange(settings.textNonStreamTimeoutSeconds, TEXT_TIMEOUT_LIMITS.nonStreamSeconds)
    && settings.textStreamMaxDurationSeconds > settings.textStreamFirstEventTimeoutSeconds
    && settings.textStreamMaxDurationSeconds > settings.textStreamIdleTimeoutSeconds;
}

export function imageProviderSettings(settings: AccountAiSettings): ImageProviderSettings {
  return {
    aiGateway: settings.imageGateway,
    quickRouterEndpoint: settings.imageQuickRouterEndpoint,
    imageModel: settings.imageModel,
    imageQuality: imageQualityForSelection(settings.imageModel, settings.imageQuality),
  };
}
