import { capImagePrompt } from "@/lib/server/repositories/course-images";

export class TencentHunyuanImageConfigError extends Error {
  constructor(message = "HY-Image-V3 API Key 缺失") {
    super(message);
    this.name = "TencentHunyuanImageConfigError";
  }
}

type TencentConfig = {
  apiKey: string;
  model: string;
};

type SubmitInput = {
  prompt: string;
  width: 1024;
  height: 768;
};

type QueryInput = {
  taskId: string;
};

type TokenHubImageResponse = {
  id?: string;
  task_id?: string;
  status?: string;
  data?: Array<{
    url?: string;
  }>;
  output?: {
    url?: string;
    image_url?: string;
  };
  error?: {
    message?: string;
  };
  message?: string;
};

function getConfig(): TencentConfig {
  const apiKey = process.env.TENCENT_HUNYUAN_API_KEY;
  const model = process.env.TENCENT_HUNYUAN_IMAGE_MODEL || "hy-image-v3.0";

  if (!apiKey) {
    throw new TencentHunyuanImageConfigError();
  }

  return { apiKey, model };
}

async function readResponseJson(response: Response): Promise<TokenHubImageResponse> {
  return (await response.json().catch(() => ({}))) as TokenHubImageResponse;
}

function errorMessage(data: TokenHubImageResponse, fallback: string) {
  return data.error?.message || data.message || fallback;
}

function imageUrl(data: TokenHubImageResponse) {
  return data.data?.[0]?.url || data.output?.url || data.output?.image_url || null;
}

function normalizeStatus(status: string | undefined) {
  const normalized = status?.toLowerCase();

  if (normalized === "succeeded" || normalized === "success" || normalized === "completed" || normalized === "done") {
    return "succeeded" as const;
  }

  if (normalized === "failed" || normalized === "fail" || normalized === "error") {
    return "failed" as const;
  }

  return "generating" as const;
}

function headers(config: TencentConfig) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
}

export function createTencentHunyuanImageClient(config = getConfig()) {
  return {
    async submit(input: SubmitInput) {
      const response = await fetch("https://tokenhub.tencentmaas.com/v1/api/image/submit", {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          model: config.model,
          prompt: capImagePrompt(input.prompt),
          n: 1,
          size: `${input.width}x${input.height}`,
          rsp_img_type: "url",
        }),
      });

      const data = await readResponseJson(response);

      if (!response.ok) {
        throw new Error(errorMessage(data, `HY-Image-V3 提交失败：${response.status}`));
      }

      const taskId = data.id || data.task_id;

      if (!taskId) {
        throw new Error(errorMessage(data, "HY-Image-V3 未返回任务 ID"));
      }

      return { taskId };
    },

    async query(input: QueryInput) {
      const response = await fetch("https://tokenhub.tencentmaas.com/v1/api/image/query", {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({ model: config.model, id: input.taskId }),
      });

      const data = await readResponseJson(response);

      if (!response.ok) {
        throw new Error(errorMessage(data, `HY-Image-V3 查询失败：${response.status}`));
      }

      const status = normalizeStatus(data.status);

      if (status === "generating") {
        return { status, imageUrl: null, failureReason: null };
      }

      if (status === "failed") {
        return { status, imageUrl: null, failureReason: errorMessage(data, "HY-Image-V3 生成失败") };
      }

      const url = imageUrl(data);

      if (!url) {
        return { status: "failed" as const, imageUrl: null, failureReason: errorMessage(data, "HY-Image-V3 未返回图片 URL") };
      }

      return { status, imageUrl: url, failureReason: null };
    },
  };
}
