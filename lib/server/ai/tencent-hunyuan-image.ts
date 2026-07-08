export class TencentHunyuanImageConfigError extends Error {
  constructor(message = "HY-Image-Lite API Key 缺失") {
    super(message);
    this.name = "TencentHunyuanImageConfigError";
  }
}

type TencentConfig = {
  apiKey: string;
  model: string;
};

type GenerateInput = {
  prompt: string;
  width: 1024;
  height: 768;
};

type TokenHubImageResponse = {
  data?: Array<{
    url?: string;
  }>;
  error?: {
    message?: string;
  };
};

function getConfig(): TencentConfig {
  const apiKey = process.env.TENCENT_HUNYUAN_API_KEY;
  const model = process.env.TENCENT_HUNYUAN_IMAGE_MODEL || "hy-image-lite";

  if (!apiKey) {
    throw new TencentHunyuanImageConfigError();
  }

  return { apiKey, model };
}

async function readResponseJson(response: Response): Promise<TokenHubImageResponse> {
  return (await response.json().catch(() => ({}))) as TokenHubImageResponse;
}

function errorMessage(data: TokenHubImageResponse, fallback: string) {
  return data.error?.message || fallback;
}

export function createTencentHunyuanImageClient(config = getConfig()) {
  return {
    async generate(input: GenerateInput) {
      const response = await fetch("https://tokenhub.tencentmaas.com/v1/api/image/lite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          prompt: input.prompt,
          n: 1,
          size: `${input.width}x${input.height}`,
          rsp_img_type: "url",
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok) {
        throw new Error(errorMessage(data, `HY-Image-Lite 请求失败：${response.status}`));
      }

      const imageUrl = data.data?.[0]?.url;

      if (!imageUrl) {
        throw new Error(errorMessage(data, "HY-Image-Lite 未返回图片 URL"));
      }

      return { imageUrl };
    },
  };
}
