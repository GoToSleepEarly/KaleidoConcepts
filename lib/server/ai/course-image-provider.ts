import type { CourseImageQuality } from "@/lib/contracts/api";
import { aiProviderBaseUrl, normalizeAiProviderSettings, type AiGateway, type AiProviderSettingsInput } from "@/lib/ai-gateway";
import { devAiLog } from "./dev-ai-log";
import { imageQualityForModel } from "./image-model-capabilities";

type ProviderResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

type ProviderConfig = { apiKey: string; model: string; timeoutMs: number; retryDelaysMs?: readonly number[]; gateway?: AiGateway; baseUrl?: string };

const FALLBACK_MODEL = "gpt-image-2-c";

function configFromEnvironment(input: AiProviderSettingsInput): ProviderConfig {
  const settings = normalizeAiProviderSettings(input);
  const gateway = settings.aiGateway;
  const isCrazyrouter = gateway === "crazyrouter";
  const apiKey = isCrazyrouter ? process.env.CRAZYROUTER_API_KEY : process.env.QUICKROUTER_IMAGE_API_KEY;
  if (!apiKey) throw new Error("图片生成服务尚未配置");
  const timeoutValue = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    gateway,
    baseUrl: aiProviderBaseUrl(settings),
    model: isCrazyrouter ? process.env.CRAZYROUTER_IMAGE_MODEL || "gpt-image-2" : process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2",
    timeoutMs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 600_000,
  };
}

function imageBlob(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("视觉参考图格式无效");
  return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
}

function imageExtension(blob: Blob) {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/jpeg") return "jpg";
  return "webp";
}

function resultImage(data: ProviderResponse) {
  const image = data.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return null;
}

export function createCourseImageProvider(config?: ProviderConfig, selectedSettings: AiProviderSettingsInput = "quickrouter") {
  const resolved = { gateway: "quickrouter" as AiGateway, baseUrl: "https://api.quickrouter.ai", ...(config ?? configFromEnvironment(selectedSettings)) };
  const { apiKey, model, timeoutMs, gateway, baseUrl } = resolved;

  function isUpstreamSaturated(response: Response, data: ProviderResponse) {
    const message = data.error?.message || data.message || "";
    return response.status === 429 && /upstream load is saturated/i.test(message);
  }

  function saturatedMessage(data: ProviderResponse) {
    const raw = data.error?.message || data.message || "";
    const requestId = /request id:\s*([^)]+)/i.exec(raw)?.[1]?.trim();
    return requestId
      ? `图片生成服务繁忙，请稍后重试（request id: ${requestId}）`
      : "图片生成服务繁忙，请稍后重试";
  }

  async function request(operation: string, path: string, requestedQuality: CourseImageQuality, buildBody: (requestModel: string, quality: CourseImageQuality) => BodyInit, headers: HeadersInit, logPayload: Record<string, unknown>) {
    const maxAttempts = gateway === "quickrouter" ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const requestModel = attempt === 0 ? model : FALLBACK_MODEL;
      const quality = imageQualityForModel(requestModel, requestedQuality);
      devAiLog({ operation, phase: "request", payload: { ...logPayload, model: requestModel, quality, ...(attempt ? { fallbackForStatus: 429 } : {}) } });
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...headers },
          body: buildBody(requestModel, quality),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        devAiLog({ operation, phase: "error", context: { gateway }, latencyMs: Date.now() - startedAt, error });
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("图片生成超时，请确认状态后重试", { cause: error });
        throw new Error("图片生成服务连接失败，请稍后重试", { cause: error });
      }
      const raw = await response.text();
      let data: ProviderResponse;
      try { data = JSON.parse(raw) as ProviderResponse; }
      catch (error) {
        devAiLog({ operation, phase: "error", context: { gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
        throw new Error("图片生成服务返回异常", { cause: error });
      }
      if (!response.ok) {
        const error = new Error(data.error?.message || data.message || "图片生成失败");
        devAiLog({ operation, phase: "error", context: { gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
        if (gateway === "quickrouter" && response.status === 429 && attempt === 0 && model !== FALLBACK_MODEL) {
          continue;
        }
        if (isUpstreamSaturated(response, data)) throw new Error(saturatedMessage(data));
        throw error;
      }
      devAiLog({ operation, phase: "response", context: { gateway }, status: response.status, latencyMs: Date.now() - startedAt, payload: data });
      const imageUrl = resultImage(data);
      if (!imageUrl) {
        const error = new Error("图片生成服务未返回图片");
        devAiLog({ operation, phase: "error", context: { gateway }, status: response.status, latencyMs: Date.now() - startedAt, error });
        throw error;
      }
      return { imageUrl, model: requestModel, quality };
    }
    throw new Error("图片生成失败");
  }

  return {
    generate(input: { prompt: string; quality: CourseImageQuality; portrait?: boolean }) {
      const size = input.portrait ? "1024x1536" : "1536x864";
      return request("course_image_generate", "/v1/images/generations", input.quality, (requestModel, quality) => JSON.stringify({ model: requestModel, prompt: input.prompt, n: 1, size, quality, ...(gateway === "crazyrouter" ? { output_format: "webp" } : { format: "webp" }) }), { "Content-Type": "application/json" }, { prompt: input.prompt, size });
    },
    edit(input: { prompt: string; quality: CourseImageQuality; imageDataUrls: string[]; portrait?: boolean }) {
      if (input.imageDataUrls.length === 0) throw new Error("缺少可用的视觉参考图");
      const size = input.portrait ? "1024x1536" : "1536x1024";
      return request("course_image_edit", "/v1/images/edits", input.quality, (requestModel, quality) => {
        const body = new FormData();
        body.set("model", requestModel);
        input.imageDataUrls.forEach((dataUrl, index) => {
          const blob = imageBlob(dataUrl);
          body.append("image[]", blob, `visual-reference-${index + 1}.${imageExtension(blob)}`);
        });
        body.set("prompt", input.prompt);
        body.set("n", "1");
        body.set("size", size);
        body.set("quality", quality);
        if (gateway === "crazyrouter") body.set("output_format", "webp");
        return body;
      }, {}, { prompt: input.prompt, size, referenceImageCount: input.imageDataUrls.length, requestEncoding: "multipart/form-data" });
    },
  };
}
