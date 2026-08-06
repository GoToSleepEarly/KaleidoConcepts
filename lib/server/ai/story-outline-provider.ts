import type { StoryWritingProvider } from "@/lib/contracts/api";

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

export function createStoryOutlineProvider(config = configFromEnvironment()) {
  async function request(body: Record<string, unknown>) {
    let response: Response;
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
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new Error("故事大纲生成超时，请稍后重试", { cause: error });
      }
      throw new Error("故事大纲服务连接失败，请稍后重试", { cause: error });
    }

    let data: ResponsesData;
    try {
      data = (await response.json()) as ResponsesData;
    } catch {
      throw new Error("故事大纲服务返回异常");
    }
    if (!response.ok) {
      throw new Error(data.error?.message || data.message || "故事大纲生成失败");
    }
    const text = outputText(data);
    if (!text) throw new Error("故事大纲服务未返回内容");
    return { text };
  }

  return {
    generateOutline: ({
      writingProvider,
      prompt,
    }: {
      writingProvider: StoryWritingProvider;
      prompt: string;
    }) =>
      request({
        model:
          writingProvider === "quickrouter_deepseek"
            ? config.deepseekModel
            : config.gptModel,
        input: prompt,
      }),
    searchReference: ({ prompt }: { prompt: string }) =>
      request({
        model: config.researchModel,
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
  };
}
