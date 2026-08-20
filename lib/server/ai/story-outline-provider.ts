import type { StoryWritingProvider } from "@/lib/contracts/api";
import type { AiGateway } from "@/lib/ai-gateway";

import { devAiLog } from "./dev-ai-log";

type ProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  gateway?: AiGateway;
  gptModel: string;
  researchModel: string;
  timeoutMs: number;
};

type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
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

type ChatCompletionsData = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string };
  }>;
  error?: { message?: string };
  message?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
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

function configFromEnvironment(gateway: AiGateway): ProviderConfig {
  const isCrazyrouter = gateway === "crazyrouter";
  const apiKey = isCrazyrouter ? process.env.CRAZYROUTER_API_KEY : process.env.QUICKROUTER_TEXT_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError();
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gateway,
    baseUrl: isCrazyrouter ? "https://api.crazyrouter.com" : "https://api.quickrouter.ai",
    gptModel: isCrazyrouter
      ? process.env.CRAZYROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol"
      : process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol",
    researchModel: isCrazyrouter
      ? process.env.CRAZYROUTER_RESEARCH_MODEL || process.env.CRAZYROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol"
      : process.env.QUICKROUTER_RESEARCH_MODEL || process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.6-sol",
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
  constructor(readonly reason?: string, readonly usage?: StoryOutlineUsage) {
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

function chatCompletionUsage(data: ChatCompletionsData): StoryOutlineUsage | undefined {
  if (!data.usage) return undefined;
  const outputTokens = data.usage.completion_tokens ?? 0;
  const reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens ?? 0;
  return {
    inputTokens: data.usage.prompt_tokens ?? 0,
    outputTokens,
    visibleOutputTokens: Math.max(0, outputTokens - reasoningTokens),
    reasoningTokens,
    totalTokens: data.usage.total_tokens ?? 0,
  };
}

function deepSeekConfigFromEnvironment(): DeepSeekConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError("DeepSeek 服务尚未配置");
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
  };
}

const RETRYABLE_CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

const INTERRUPTED_RESPONSE_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "EPIPE",
]);

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

export function createStoryOutlineProvider(config?: ProviderConfig, selectedGateway: AiGateway = "quickrouter") {
  function resolvedConfig() {
    if (config) return { baseUrl: "https://api.quickrouter.ai", gateway: "quickrouter" as const, ...config };
    return configFromEnvironment(selectedGateway);
  }

  async function request(operation: string, body: Record<string, unknown>, activeConfig: ProviderConfig, timeoutMs = activeConfig.timeoutMs) {
    const startedAt = Date.now();
    devAiLog({ operation, phase: "request", payload: body });
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await fetch(`${activeConfig.baseUrl ?? "https://api.quickrouter.ai"}/v1/responses`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${activeConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
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
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new Error("故事大纲生成超时，请稍后重试", { cause: error });
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
      devAiLog({ operation, phase: "error", context: { gateway: activeConfig.gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
      const code = transportErrorCode(error);
      if (code && INTERRUPTED_RESPONSE_CODES.has(code)) {
        throw new Error("故事大纲服务响应中断，未收到完整结果，请重试本步", { cause: error });
      }
      throw new Error("故事大纲服务返回异常", { cause: error });
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "故事大纲生成失败");
      devAiLog({ operation, phase: "error", context: { gateway: activeConfig.gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
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
      devAiLog({ operation, phase: "error", context: { gateway: activeConfig.gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    return {
      text,
      usage: responseUsage(data),
    };
  }

  async function requestDeepSeek(operation: string, prompt: string, maxOutputTokens?: number, timeoutOverride?: number) {
    const activeConfig = deepSeekConfigFromEnvironment();
    const body = {
      model: activeConfig.model,
      messages: [{ role: "user", content: prompt }],
      ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
    };
    const startedAt = Date.now();
    devAiLog({ operation, phase: "request", payload: body });
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await fetch(`${activeConfig.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${activeConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutOverride ?? activeConfig.timeoutMs),
        });
        break;
      } catch (error) {
        const retrying = attempt === 1 && canRetryBeforeConnection(error);
        devAiLog({ operation, phase: "error", context: { gateway: "deepseek" }, latencyMs: Date.now() - startedAt, payload: { attempt, retrying }, error });
        if (retrying) continue;
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new Error("故事大纲生成超时，请稍后重试", { cause: error });
        }
        throw new Error("故事大纲服务连接失败，请稍后重试", { cause: error });
      }
    }
    if (!response) throw new Error("故事大纲服务连接失败，请稍后重试");

    let data: ChatCompletionsData;
    try {
      const rawResponse = await response.text();
      devAiLog({ operation, phase: "response", status: response.status, latencyMs: Date.now() - startedAt, payload: rawResponse });
      data = JSON.parse(rawResponse) as ChatCompletionsData;
    } catch (error) {
      devAiLog({ operation, phase: "error", context: { gateway: "deepseek" }, status: response.status, latencyMs: Date.now() - startedAt, error });
      const code = transportErrorCode(error);
      if (code && INTERRUPTED_RESPONSE_CODES.has(code)) {
        throw new Error("故事大纲服务响应中断，未收到完整结果，请重试本步", { cause: error });
      }
      throw new Error("故事大纲服务返回异常", { cause: error });
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "故事大纲生成失败");
      devAiLog({ operation, phase: "error", context: { gateway: "deepseek" }, status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    const usage = chatCompletionUsage(data);
    if (data.choices?.[0]?.finish_reason === "length") {
      const error = new StoryOutlineIncompleteResponseError("max_output_tokens", usage);
      devAiLog({ operation, phase: "error", context: { gateway: "deepseek" }, status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      const error = new Error("故事大纲服务未返回内容");
      devAiLog({ operation, phase: "error", context: { gateway: "deepseek" }, status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    return { text, usage };
  }

  return {
    generateOutline: ({
      writingProvider,
      prompt,
      operation,
      timeoutMs,
      reasoningEffort,
      maxOutputTokens,
    }: {
      writingProvider: StoryWritingProvider;
      prompt: string;
      operation?: string;
      timeoutMs?: number;
      reasoningEffort?: "low" | "medium" | "high";
      maxOutputTokens?: number;
    }) => {
      // `quickrouter_deepseek` 是历史持久化标识；DeepSeek 实际始终使用官方直连配置。
      if (writingProvider === "quickrouter_deepseek") {
        return requestDeepSeek(operation || "story_outline", prompt, maxOutputTokens, timeoutMs);
      }
      const activeConfig = resolvedConfig();
      return request(operation || "story_outline", {
        model: activeConfig.gptModel,
        input: prompt,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      }, activeConfig, timeoutMs);
    },
    searchReference: ({ prompt, operation = "search_reference" }: { prompt: string; operation?: string }) => {
      const activeConfig = resolvedConfig();
      return request(operation, {
        model: activeConfig.researchModel,
        input: prompt,
        tools: [{ type: "web_search" }],
      }, activeConfig);
    },
  };
}
