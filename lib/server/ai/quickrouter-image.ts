import { capImagePrompt } from "@/lib/server/repositories/course-images";

export class QuickRouterImageConfigError extends Error {
  constructor(message = "QuickRouter API Key 缺失") {
    super(message);
    this.name = "QuickRouterImageConfigError";
  }
}

type QuickRouterConfig = {
  apiKey: string;
  model: string;
  quality: "low" | "medium" | "high";
  timeoutMs: number;
};

const DEFAULT_GENERATION_TIMEOUT_MS = 600000;

type SubmitInput = {
  prompt: string;
  width: 1280;
  height: 720;
};

type QuickRouterImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
  message?: string;
};

function getConfig(): QuickRouterConfig {
  const apiKey = process.env.QUICKROUTER_API_KEY;
  const model = process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2";
  const quality = imageQuality(process.env.QUICKROUTER_IMAGE_QUALITY);
  const timeoutMs = positiveIntEnv(process.env.IMAGE_GENERATION_TIMEOUT_MS, DEFAULT_GENERATION_TIMEOUT_MS);

  if (!apiKey) {
    throw new QuickRouterImageConfigError();
  }

  return { apiKey, model, quality, timeoutMs };
}

function positiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function imageQuality(value: string | undefined): QuickRouterConfig["quality"] {
  return value === "low" || value === "medium" || value === "high" ? value : "low";
}

type QuickRouterRawResponse = {
  data: QuickRouterImageResponse;
  rawBody: string;
  parseFailed: boolean;
};

async function readResponseJson(response: Response): Promise<QuickRouterRawResponse> {
  try {
    const data = (await response.json()) as QuickRouterImageResponse;
    return { data, rawBody: "", parseFailed: false };
  } catch {
    return { data: {}, rawBody: "", parseFailed: true };
  }
}

function errorMessage(data: QuickRouterImageResponse, fallback: string) {
  return data.error?.message || data.message || fallback;
}

function imageResult(data: QuickRouterImageResponse) {
  const first = data.data?.[0];
  if (first?.url) {
    return first.url;
  }
  if (first?.b64_json) {
    return `data:image/webp;base64,${first.b64_json}`;
  }
  return null;
}

function isRetriableFailure(status: number, parseFailed: boolean, imageUrl: string | null) {
  if (status >= 500) return true;
  if (parseFailed) return true;
  if (status === 200 && !imageUrl) return true;
  return false;
}

function headers(config: QuickRouterConfig) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

export function createQuickRouterImageClient(config = getConfig()) {
  const maxRetries = 1;

  function isRetriableError(error: unknown) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return true;
    }
    if (error instanceof TypeError) {
      return true;
    }
    return false;
  }

  return {
    async submit(input: SubmitInput) {
      void input.width;
      void input.height;

      async function submitOnce(attempt: number): Promise<{ retriable: boolean; imageUrl: string | null }> {
        let response: Response;
        try {
          response = await fetch("https://api.quickrouter.ai/v1/images/generations", {
            method: "POST",
            headers: headers(config),
            body: JSON.stringify({
              model: config.model,
              prompt: capImagePrompt(input.prompt),
              n: 1,
              size: "1536x864",
              quality: config.quality,
              format: "webp",
            }),
            signal: AbortSignal.timeout(config.timeoutMs),
          });
        } catch (error) {
          if (isRetriableError(error)) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[quickrouter] retriable network error attempt=${attempt}: ${msg}`);
            return { retriable: true, imageUrl: null };
          }
          throw error;
        }

        const { data, parseFailed } = await readResponseJson(response);
        const imageUrl = imageResult(data);

        if (isRetriableFailure(response.status, parseFailed, imageUrl)) {
          console.warn(
            `[quickrouter] retriable response attempt=${attempt} status=${response.status} parseFailed=${parseFailed}`,
          );
          return { retriable: true, imageUrl: null };
        }

        if (!response.ok) {
          throw new Error(errorMessage(data, `QuickRouter GPT-image-2 生成失败：${response.status}`));
        }

        if (!imageUrl) {
          throw new Error(errorMessage(data, "QuickRouter GPT-image-2 未返回图片"));
        }

        return { retriable: false, imageUrl };
      }

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const result = await submitOnce(attempt);
        if (!result.retriable) {
          return { imageUrl: result.imageUrl! };
        }
      }

      throw new Error(`QuickRouter GPT-image-2 生成失败：重试 ${maxRetries + 1} 次后仍未返回有效图片`);
    },

    async query() {
      return { status: "failed" as const, imageUrl: null, failureReason: "QuickRouter GPT-image-2 为同步生成接口，无需轮询" };
    },
  };
}
