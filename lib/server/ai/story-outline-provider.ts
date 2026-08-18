import type { StoryWritingProvider } from "@/lib/contracts/api";

import { devAiLog } from "./dev-ai-log";

type ProviderConfig = {
  apiKey: string;
  gptModel: string;
  deepseekModel: string;
  researchModel: string;
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

function configFromEnvironment(): ProviderConfig {
  const apiKey = process.env.QUICKROUTER_TEXT_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError();
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gptModel: process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.5",
    deepseekModel: process.env.QUICKROUTER_DEEPSEEK_TEXT_MODEL || "deepseek-v4-flash",
    researchModel: process.env.QUICKROUTER_RESEARCH_MODEL || process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.5",
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

const RETRYABLE_CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

function transportErrorCode(error: unknown) {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) return null;
  const code = Reflect.get(error.cause, "code");
  return typeof code === "string" ? code : null;
}

function canRetryBeforeConnection(error: unknown) {
  const code = transportErrorCode(error);
  return code !== null && RETRYABLE_CONNECT_CODES.has(code);
}

export function createStoryOutlineProvider(config = configFromEnvironment()) {
  async function request(operation: string, body: Record<string, unknown>, timeoutMs = config.timeoutMs) {
    const startedAt = Date.now();
    devAiLog({ operation, phase: "request", payload: body });
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await fetch("https://api.quickrouter.ai/v1/responses", {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.apiKey}`,
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
      devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
      throw new Error("故事大纲服务返回异常", { cause: error });
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "故事大纲生成失败");
      devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    if (data.status === "incomplete") {
      const error = new StoryOutlineIncompleteResponseError(data.incomplete_details?.reason, responseUsage(data));
      devAiLog({
        operation,
        phase: "error",
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
      devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    return {
      text,
      usage: responseUsage(data),
    };
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
    }) =>
      request(operation || "story_outline", {
        model:
          writingProvider === "quickrouter_deepseek"
            ? config.deepseekModel
            : config.gptModel,
        input: prompt,
        ...(writingProvider === "quickrouter_gpt" && reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      }, timeoutMs),
    searchReference: ({ prompt, operation = "search_reference" }: { prompt: string; operation?: string }) =>
      request(operation, {
        model: config.researchModel,
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
  };
}
