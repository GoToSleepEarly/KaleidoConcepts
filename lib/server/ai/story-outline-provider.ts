import { Agent, fetch as undiciFetch, type Dispatcher, type RequestInit as UndiciRequestInit } from "undici";

import type { StoryWritingProvider } from "@/lib/contracts/api";
import { aiProviderBaseUrl, normalizeAiProviderSettings, upstreamTextModel, type AiGateway, type AiProviderSettingsInput, type TextGenerationModel } from "@/lib/ai-gateway";

import { devAiLog } from "./dev-ai-log";

type ProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  gateway?: AiGateway | "deepseek";
  gptModel: string;
  researchModel: string;
  responsesPath?: string;
  timeoutMs: number;
};

type ResponsesData = {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
  }>;
  error?: { message?: string };
  message?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

export type StoryOutlineUsage = {
  inputTokens: number;
  outputTokens: number;
  visibleOutputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export class StoryOutlineProviderConfigError extends Error {
  constructor(message = "故事大纲服务尚未配置") {
    super(message);
    this.name = "StoryOutlineProviderConfigError";
  }
}

export class AiProviderResultUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiProviderResultUnknownError";
  }
}

const textDispatchers = new Map<number, Dispatcher>();
const transportTimeoutMarginMs = 30_000;

export function textTransportTimeoutMs(requestTimeoutMs: number) {
  return requestTimeoutMs + transportTimeoutMarginMs;
}

function textDispatcher(requestTimeoutMs: number) {
  const transportTimeout = textTransportTimeoutMs(requestTimeoutMs);
  const existing = textDispatchers.get(transportTimeout);
  if (existing) return existing;
  const dispatcher = new Agent({
    headersTimeout: transportTimeout,
    bodyTimeout: transportTimeout,
  });
  textDispatchers.set(transportTimeout, dispatcher);
  return dispatcher;
}

function configFromEnvironment(input: AiProviderSettingsInput): ProviderConfig & { gateway: AiGateway } {
  const settings = normalizeAiProviderSettings(input);
  const gateway = settings.aiGateway;
  const isCrazyrouter = gateway === "crazyrouter";
  const isEasy88ai = gateway === "easy88ai";
  const apiKey = isCrazyrouter ? process.env.CRAZYROUTER_API_KEY : isEasy88ai ? process.env.EASY88AI_API_KEY : process.env.QUICKROUTER_TEXT_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError();
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gateway,
    baseUrl: aiProviderBaseUrl(settings),
    gptModel: "gpt-5.6-sol",
    researchModel: "gpt-5.6-sol",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
  };
}

function outputText(data: ResponsesData) {
  if (data.output_text) return data.output_text;
  const parts = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text));
  return parts?.join("\n").trim() || null;
}

export class StoryOutlineIncompleteResponseError extends Error {
  constructor(
    readonly reason?: string,
    readonly usage?: StoryOutlineUsage,
  ) {
    super(reason === "max_output_tokens" ? "模型输出达到上限，返回内容未完成" : "模型返回内容未完成");
    this.name = "StoryOutlineIncompleteResponseError";
  }
}

function responseUsage(data: ResponsesData): StoryOutlineUsage | undefined {
  if (!data.usage) return undefined;
  const outputTokens = data.usage.output_tokens ?? 0;
  const reasoningTokens = data.usage.output_tokens_details?.reasoning_tokens ?? 0;
  return {
    inputTokens: data.usage.input_tokens ?? 0,
    outputTokens,
    visibleOutputTokens: Math.max(0, outputTokens - reasoningTokens),
    reasoningTokens,
    totalTokens: data.usage.total_tokens ?? 0,
  };
}

function deepSeekConfigFromEnvironment(): ProviderConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError("DeepSeek 服务尚未配置");
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    baseUrl: "https://api.deepseek.com",
    gateway: "deepseek",
    gptModel: "deepseek-v4-pro",
    researchModel: "deepseek-v4-pro",
    responsesPath: "/responses",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
  };
}

const RETRYABLE_CONNECT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

const INTERRUPTED_RESPONSE_CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE"]);

function transportErrorCode(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = Reflect.get(current, "code");
    if (typeof code === "string") return code;
    current = Reflect.get(current, "cause");
  }
  return null;
}

function canRetryBeforeConnection(error: unknown) {
  const code = transportErrorCode(error);
  return code !== null && RETRYABLE_CONNECT_CODES.has(code);
}

function isAmbiguousTimeout(error: unknown) {
  const code = transportErrorCode(error);
  return code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
}

export function createStoryOutlineProvider(config?: ProviderConfig, selectedSettings: AiProviderSettingsInput = "quickrouter") {
  function resolvedConfig(model?: TextGenerationModel) {
    if (model === "deepseek-v4-pro") return deepSeekConfigFromEnvironment();
    if (config)
      return {
        baseUrl: "https://api.quickrouter.ai",
        gateway: "quickrouter" as const,
        ...config,
      };
    const activeConfig = configFromEnvironment(selectedSettings);
    if (!model) return activeConfig;
    const selectedModel = upstreamTextModel(model, activeConfig.gateway ?? "quickrouter");
    return {
      ...activeConfig,
      gptModel: selectedModel,
      researchModel: selectedModel,
    };
  }

  async function request(operation: string, body: Record<string, unknown>, activeConfig: ProviderConfig, timeoutMs = activeConfig.timeoutMs) {
    const startedAt = Date.now();
    devAiLog({ operation, phase: "request", payload: body });
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = (await undiciFetch(`${activeConfig.baseUrl ?? "https://api.quickrouter.ai"}${activeConfig.responsesPath ?? "/v1/responses"}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${activeConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
          dispatcher: textDispatcher(timeoutMs),
        } as UndiciRequestInit)) as unknown as Response;
        break;
      } catch (error) {
        const retrying = attempt === 1 && canRetryBeforeConnection(error);
        devAiLog({
          operation,
          phase: "error",
          context: { gateway: activeConfig.gateway },
          latencyMs: Date.now() - startedAt,
          payload: { attempt, retrying },
          error,
        });
        if (retrying) continue;
        if (isAmbiguousTimeout(error)) {
          throw new AiProviderResultUnknownError("故事大纲服务响应超时，生成结果未能确认，请手动重试本步", { cause: error });
        }
        throw new Error("故事大纲服务连接失败，请稍后重试", { cause: error });
      }
    }

    if (!response) throw new Error("故事大纲服务连接失败，请稍后重试");

    let data: ResponsesData;
    let rawResponse: string;
    try {
      rawResponse = await response.text();
      devAiLog({
        operation,
        phase: "response",
        status: response.status,
        latencyMs: Date.now() - startedAt,
        payload: rawResponse,
      });
      data = JSON.parse(rawResponse) as ResponsesData;
    } catch (error) {
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      const code = transportErrorCode(error);
      if (isAmbiguousTimeout(error) || (code && INTERRUPTED_RESPONSE_CODES.has(code))) {
        const reason = isAmbiguousTimeout(error) ? "响应超时" : "响应中断";
        throw new AiProviderResultUnknownError(`故事大纲服务${reason}，生成结果未能确认，请手动重试本步`, { cause: error });
      }
      throw new Error("故事大纲服务返回异常", { cause: error });
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "故事大纲生成失败");
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
    if (data.status === "incomplete") {
      const error = new StoryOutlineIncompleteResponseError(data.incomplete_details?.reason, responseUsage(data));
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        payload: { incompleteReason: data.incomplete_details?.reason },
        error,
      });
      throw error;
    }
    const text = outputText(data);
    if (!text) {
      const error = new Error("故事大纲服务未返回内容");
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
    return {
      text,
      usage: responseUsage(data),
    };
  }

  return {
    generateOutline: ({ writingProvider, prompt, operation, timeoutMs, reasoningEffort, maxOutputTokens }: { writingProvider: StoryWritingProvider; prompt: string; operation?: string; timeoutMs?: number; reasoningEffort?: "low" | "medium" | "high"; maxOutputTokens?: number }) => {
      const activeConfig = resolvedConfig(writingProvider);
      return request(
        operation || "story_outline",
        {
          model: activeConfig.gptModel,
          input: prompt,
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
          ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
        },
        activeConfig,
        timeoutMs,
      );
    },
    searchReference: ({ writingProvider = "gpt-5.6-sol", prompt, operation = "search_reference" }: { writingProvider?: StoryWritingProvider; prompt: string; operation?: string }) => {
      const activeConfig = resolvedConfig(writingProvider);
      return request(
        operation,
        {
          model: activeConfig.researchModel,
          input: prompt,
          tools: [{ type: "web_search" }],
          ...(activeConfig.gateway === "deepseek" ? { tool_choice: { type: "web_search" } } : {}),
        },
        activeConfig,
      );
    },
  };
}
