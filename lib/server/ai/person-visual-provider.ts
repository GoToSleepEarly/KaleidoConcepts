type ProviderConfig = {
  apiKey: string;
  model: string;
  quality: "low" | "medium" | "high";
  timeoutMs: number;
};

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

function configFromEnvironment(): ProviderConfig {
  const apiKey = process.env.QUICKROUTER_API_KEY;
  if (!apiKey) throw new PersonVisualProviderConfigError();
  const qualityValue = process.env.QUICKROUTER_IMAGE_QUALITY;
  const quality =
    qualityValue === "medium" || qualityValue === "high" ? qualityValue : "low";
  const timeout = Number(process.env.IMAGE_GENERATION_TIMEOUT_MS);
  return {
    apiKey,
    model: process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2",
    quality,
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

export function createPersonVisualProvider(config = configFromEnvironment()) {
  async function readResponse(response: Response) {
    let data: ProviderResponse;
    try {
      data = (await response.json()) as ProviderResponse;
    } catch {
      throw new Error("人物形象服务返回异常");
    }
    if (!response.ok)
      throw new Error(
        data.error?.message || data.message || "人物形象生成失败",
      );
    const imageUrl = resultImage(data);
    if (!imageUrl) throw new Error("人物形象服务未返回图片");
    return { imageUrl };
  }

  async function request(path: string, body: BodyInit, headers: HeadersInit) {
    let response: Response;
    try {
      response = await fetch(`https://api.quickrouter.ai${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new Error("人物形象生成超时，请确认后再重试", { cause: error });
      }
      throw new Error("人物形象服务连接失败，请稍后重试", { cause: error });
    }
    return readResponse(response);
  }

  return {
    generate: ({ prompt }: { prompt: string }) =>
      request(
        "/v1/images/generations",
        JSON.stringify({
          model: config.model,
          prompt,
          n: 1,
          size: "1024x1536",
          quality: config.quality,
          format: "webp",
        }),
        { "Content-Type": "application/json" },
      ),
    edit: ({
      prompt,
      imageDataUrl,
    }: {
      prompt: string;
      imageDataUrl: string;
    }) => {
      const body = new FormData();
      body.set("model", config.model);
      body.set("prompt", prompt);
      body.set("n", "1");
      body.set("size", "1024x1536");
      body.set("quality", config.quality);
      body.set("format", "webp");
      body.set("image", imageBlob(imageDataUrl), "person-reference.png");
      return request("/v1/images/edits", body, {});
    },
  };
}
