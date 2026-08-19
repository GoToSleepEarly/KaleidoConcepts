import type { CourseImageQuality } from "@/lib/contracts/api";
import type { AiGateway } from "@/lib/ai-gateway";
import { devAiLog } from "./dev-ai-log";
import { imageQualityForModel } from "./image-model-capabilities";

type ProviderConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  gateway?: AiGateway;
  baseUrl?: string;
};

const PERSON_VISUAL_QUALITY = "low" as const;
const FALLBACK_MODEL = "gpt-image-2-c";

type ProviderResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

export class PersonVisualProviderConfigError extends Error {
  constructor(message = "人物形象服务尚未配置") {
    super(message);
    this.name = "PersonVisualProviderConfigError";
  }
}

function configFromEnvironment(gateway: AiGateway): ProviderConfig {
  const isCrazyrouter = gateway === "crazyrouter";
  const apiKey = isCrazyrouter ? process.env.CRAZYROUTER_API_KEY : process.env.QUICKROUTER_IMAGE_API_KEY;
  if (!apiKey) throw new PersonVisualProviderConfigError();
  const timeout = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gateway,
    baseUrl: isCrazyrouter ? "https://api.crazyrouter.com" : "https://api.quickrouter.ai",
    model: isCrazyrouter ? process.env.CRAZYROUTER_IMAGE_MODEL || "gpt-image-2" : process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
  };
}

function resultImage(data: ProviderResponse) {
  const image = data.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return null;
}

function imageBlob(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("人物形象来源图片格式无效");
  return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
}

export function createPersonVisualProvider(config?: ProviderConfig, selectedGateway: AiGateway = "quickrouter") {
  const resolved = { gateway: "quickrouter" as AiGateway, baseUrl: "https://api.quickrouter.ai", ...(config ?? configFromEnvironment(selectedGateway)) };
  async function readResponse(response: Response, operation: string, startedAt: number) {
    let data: ProviderResponse;
    try {
      const rawResponse = await response.text();
      data = JSON.parse(rawResponse) as ProviderResponse;
      devAiLog({
        operation,
        phase: "response",
        status: response.status,
        latencyMs: Date.now() - startedAt,
        payload: data,
      });
    } catch (error) {
      devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
      throw new Error("人物形象服务返回异常", { cause: error });
    }
    return data;
  }

  async function request(operation: string, path: string, buildBody: (requestModel: string, quality: CourseImageQuality) => BodyInit, headers: HeadersInit, logPayload: Record<string, unknown>) {
    const maxAttempts = resolved.gateway === "quickrouter" ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const requestModel = attempt === 0 ? resolved.model : FALLBACK_MODEL;
      const quality = imageQualityForModel(requestModel, PERSON_VISUAL_QUALITY);
      devAiLog({ operation, phase: "request", payload: { ...logPayload, model: requestModel, quality, ...(attempt ? { fallbackForStatus: 429 } : {}) } });
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(`${resolved.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${resolved.apiKey}`,
            ...headers,
          },
          body: buildBody(requestModel, quality),
          signal: AbortSignal.timeout(resolved.timeoutMs),
        });
      } catch (error) {
        devAiLog({ operation, phase: "error", latencyMs: Date.now() - startedAt, error });
        if (
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new Error("人物形象生成超时，请确认后再重试", { cause: error });
        }
        throw new Error("人物形象服务连接失败，请稍后重试", { cause: error });
      }
      const data = await readResponse(response, operation, startedAt);
      if (resolved.gateway === "quickrouter" && response.status === 429 && attempt === 0 && resolved.model !== FALLBACK_MODEL) {
        continue;
      }
      if (!response.ok) {
        const error = new Error(data.error?.message || data.message || "人物形象生成失败");
        devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
        throw error;
      }
      const imageUrl = resultImage(data);
      if (!imageUrl) {
        const error = new Error("人物形象服务未返回图片");
        devAiLog({ operation, phase: "error", status: response.status, latencyMs: Date.now() - startedAt, error });
        throw error;
      }
      return { imageUrl, model: requestModel, quality };
    }
    throw new Error("人物形象生成失败");
  }

  return {
    generate: ({ prompt }: { prompt: string }) =>
      request(
        "person_visual_generate",
        "/v1/images/generations",
        (requestModel, quality) => JSON.stringify({
          model: requestModel,
          prompt,
          n: 1,
          size: "1024x1536",
          quality,
          ...(resolved.gateway === "crazyrouter" ? { output_format: "webp" } : { format: "webp" }),
        }),
        { "Content-Type": "application/json" },
        { prompt, size: "1024x1536", format: "webp" },
      ),
    edit: ({
      prompt,
      imageDataUrl,
    }: {
      prompt: string;
      imageDataUrl: string;
    }) => {
      return request(
        "person_visual_edit",
        "/v1/images/edits",
        (requestModel, quality) => {
          const body = new FormData();
          body.set("model", requestModel);
          body.set("image", imageBlob(imageDataUrl), "person-reference.png");
          body.set("prompt", prompt);
          body.set("n", "1");
          body.set("size", "1024x1536");
          body.set("quality", quality);
          if (resolved.gateway === "crazyrouter") body.set("output_format", "webp");
          return body;
        },
        {},
        {
          prompt,
          size: "1024x1536",
          format: "webp",
          imageDataUrl,
        },
      );
    },
  };
}
