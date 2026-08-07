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
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
  }>;
  error?: { message?: string };
  message?: string;
};

export class StoryOutlineProviderConfigError extends Error {
  constructor(message = "故事大纲服务尚未配置") {
    super(message);
    this.name = "StoryOutlineProviderConfigError";
  }
}

function configFromEnvironment(): ProviderConfig {
  const apiKey = process.env.QUICKROUTER_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError();
  const timeout = Number(process.env.TEXT_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gptModel: process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.5",
    deepseekModel: process.env.QUICKROUTER_DEEPSEEK_TEXT_MODEL || "deepseek-v4-flash",
    researchModel: process.env.QUICKROUTER_RESEARCH_MODEL || process.env.QUICKROUTER_GPT_TEXT_MODEL || "gpt-5.5",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 180_000,
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
  async function request(operation: string, body: Record<string, unknown>) {
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
          signal: AbortSignal.timeout(config.timeoutMs),
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
    const text = outputText(data);
    if (!text) {
      const error = new Error("故事大纲服务未返回内容");
      devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
      throw error;
    }
    return { text };
  }

  return {
    generateOutline: ({
      writingProvider,
      prompt,
      operation,
    }: {
      writingProvider: StoryWritingProvider;
      prompt: string;
      operation?: string;
    }) =>
      request(operation || "story_outline", {
        model:
          writingProvider === "quickrouter_deepseek"
            ? config.deepseekModel
            : config.gptModel,
        input: prompt,
      }),
    searchReference: ({ prompt, operation = "search_reference" }: { prompt: string; operation?: string }) =>
      request(operation, {
        model: config.researchModel,
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
  };
}
