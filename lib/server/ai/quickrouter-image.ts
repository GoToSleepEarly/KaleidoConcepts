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
};

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

  if (!apiKey) {
    throw new QuickRouterImageConfigError();
  }

  return { apiKey, model, quality };
}

function imageQuality(value: string | undefined): QuickRouterConfig["quality"] {
  return value === "low" || value === "medium" || value === "high" ? value : "low";
}

async function readResponseJson(response: Response): Promise<QuickRouterImageResponse> {
  return (await response.json().catch(() => ({}))) as QuickRouterImageResponse;
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

function headers(config: QuickRouterConfig) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

export function createQuickRouterImageClient(config = getConfig()) {
  return {
    async submit(input: SubmitInput) {
      void input.width;
      void input.height;

      const response = await fetch("https://api.quickrouter.ai/v1/images/generations", {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          model: config.model,
          prompt: capImagePrompt(input.prompt),
          n: 1,
          size: "1536x1024",
          quality: config.quality,
          format: "webp",
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok) {
        throw new Error(errorMessage(data, `QuickRouter GPT-image-2 生成失败：${response.status}`));
      }

      const imageUrl = imageResult(data);
      if (!imageUrl) {
        throw new Error(errorMessage(data, "QuickRouter GPT-image-2 未返回图片"));
      }

      return { imageUrl };
    },

    async query() {
      return { status: "failed" as const, imageUrl: null, failureReason: "QuickRouter GPT-image-2 为同步生成接口，无需轮询" };
    },
  };
}
