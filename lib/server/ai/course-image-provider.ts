import type { CourseImageQuality } from "@/lib/contracts/api";
import { devAiLog } from "./dev-ai-log";

type ProviderResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
};

type ProviderConfig = { apiKey: string; model: string; timeoutMs: number; retryDelaysMs?: readonly number[] };

const DEFAULT_SATURATION_RETRY_DELAYS_MS = [1_000, 2_000] as const;

function configFromEnvironment(): ProviderConfig {
  const apiKey = process.env.QUICKROUTER_IMAGE_API_KEY;
  if (!apiKey) throw new Error("图片生成服务尚未配置");
  const timeoutValue = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    model: process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2",
    timeoutMs: Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 600_000,
  };
}

function imageBlob(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("视觉参考图格式无效");
  return new Blob([Buffer.from(match[2], "base64")], { type: match[1] });
}

function resultImage(data: ProviderResponse) {
  const image = data.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return null;
}

export function createCourseImageProvider(config = configFromEnvironment()) {
  const { apiKey, model, timeoutMs } = config;
  const retryDelaysMs = config.retryDelaysMs ?? DEFAULT_SATURATION_RETRY_DELAYS_MS;

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

  async function waitBeforeRetry(delayMs: number) {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  async function request(operation: string, path: string, body: BodyInit, headers: HeadersInit, logPayload: unknown) {
    devAiLog({ operation, phase: "request", payload: logPayload });
    for (let attempt = 0; ; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(`https://api.quickrouter.ai${path}`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...headers },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        devAiLog({ operation, phase: "error", latencyMs: Date.now() - startedAt, error });
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("图片生成超时，请确认状态后重试", { cause: error });
        throw new Error("图片生成服务连接失败，请稍后重试", { cause: error });
      }
      const raw = await response.text();
      let data: ProviderResponse;
      try { data = JSON.parse(raw) as ProviderResponse; }
      catch (error) { throw new Error("图片生成服务返回异常", { cause: error }); }
      devAiLog({ operation, phase: response.ok ? "response" : "error", status: response.status, latencyMs: Date.now() - startedAt, payload: data });
      if (!response.ok) {
        if (isUpstreamSaturated(response, data) && attempt < retryDelaysMs.length) {
          await waitBeforeRetry(retryDelaysMs[attempt] ?? 0);
          continue;
        }
        if (isUpstreamSaturated(response, data)) throw new Error(saturatedMessage(data));
        throw new Error(data.error?.message || data.message || "图片生成失败");
      }
      const imageUrl = resultImage(data);
      if (!imageUrl) throw new Error("图片生成服务未返回图片");
      return { imageUrl };
    }
  }

  return {
    generate(input: { prompt: string; quality: CourseImageQuality; portrait?: boolean }) {
      const size = input.portrait ? "1024x1536" : "1536x864";
      return request("course_image_generate", "/v1/images/generations", JSON.stringify({ model, prompt: input.prompt, n: 1, size, quality: input.quality, format: "webp" }), { "Content-Type": "application/json" }, { model, prompt: input.prompt, size, quality: input.quality });
    },
    edit(input: { prompt: string; quality: CourseImageQuality; imageDataUrl: string; portrait?: boolean }) {
      const size = input.portrait ? "1024x1536" : "1536x1024";
      const body = new FormData();
      body.set("model", model);
      body.set("image", imageBlob(input.imageDataUrl), "visual-reference.webp");
      body.set("prompt", input.prompt);
      body.set("n", "1");
      body.set("size", size);
      body.set("quality", input.quality);
      return request("course_image_edit", "/v1/images/edits", body, {}, { model, prompt: input.prompt, size, quality: input.quality, requestEncoding: "multipart/form-data" });
    },
  };
}
