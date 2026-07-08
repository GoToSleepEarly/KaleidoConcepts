import { createHash, createHmac } from "node:crypto";

export class TencentHunyuanImageConfigError extends Error {
  constructor(message = "腾讯混元生图配置缺失") {
    super(message);
    this.name = "TencentHunyuanImageConfigError";
  }
}

type TencentConfig = {
  secretId: string;
  secretKey: string;
  region: string;
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

type TencentJobPayload = {
  JobStatusCode?: string;
  ResultImage?: string[];
  JobErrorMsg?: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getConfig(): TencentConfig {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  const region = process.env.TENCENTCLOUD_REGION || "ap-guangzhou";
  const model = process.env.TENCENT_HUNYUAN_IMAGE_MODEL || "hunyuan-image";

  if (!secretId || !secretKey) {
    throw new TencentHunyuanImageConfigError();
  }

  return { secretId, secretKey, region, model };
}

function signHeaders(config: TencentConfig, action: string, payload: string) {
  const host = "hunyuan.tencentcloudapi.com";
  const service = "hunyuan";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const algorithm = "TC3-HMAC-SHA256";
  const hashedRequestPayload = sha256(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedRequestPayload].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, timestamp, credentialScope, sha256(canonicalRequest)].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `${algorithm} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": "2023-09-01",
    "X-TC-Region": config.region,
  };
}

async function requestTencent(action: string, body: Record<string, unknown>, config: TencentConfig) {
  const payload = JSON.stringify(body);
  const response = await fetch("https://hunyuan.tencentcloudapi.com", {
    method: "POST",
    headers: signHeaders(config, action, payload),
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`腾讯混元请求失败：${response.status}`);
  }

  const data = (await response.json()) as { Response?: Record<string, unknown> };

  if (data.Response?.Error) {
    const error = data.Response.Error as { Message?: string };
    throw new Error(error.Message || "腾讯混元请求失败");
  }

  return data.Response ?? {};
}

export function normalizeTencentImageJob(payload: TencentJobPayload) {
  if (payload.JobStatusCode === "5" && payload.ResultImage?.[0]) {
    return {
      status: "succeeded" as const,
      imageUrl: payload.ResultImage[0],
      failureReason: null,
    };
  }

  if (payload.JobStatusCode === "6") {
    return {
      status: "failed" as const,
      imageUrl: null,
      failureReason: payload.JobErrorMsg || "腾讯混元图片生成失败",
    };
  }

  return {
    status: "generating" as const,
    imageUrl: null,
    failureReason: null,
  };
}

export function createTencentHunyuanImageClient(config = getConfig()) {
  return {
    async submit(input: SubmitInput) {
      const response = await requestTencent(
        "SubmitHunyuanImageJob",
        {
          Prompt: input.prompt,
          Style: "201",
          Resolution: `${input.width}:${input.height}`,
          Model: config.model,
        },
        config,
      );
      const taskId = response.JobId;

      if (typeof taskId !== "string" || !taskId) {
        throw new Error("腾讯混元未返回任务 ID");
      }

      return { taskId };
    },

    async query(input: QueryInput) {
      const response = await requestTencent("QueryHunyuanImageJob", { JobId: input.taskId }, config);
      return normalizeTencentImageJob(response as TencentJobPayload);
    },
  };
}
