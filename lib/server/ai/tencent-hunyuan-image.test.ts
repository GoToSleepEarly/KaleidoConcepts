import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTencentHunyuanImageClient, normalizeTencentImageJob, TencentHunyuanImageConfigError } from "./tencent-hunyuan-image";

describe("Tencent Hunyuan image client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TENCENTCLOUD_SECRET_ID;
    delete process.env.TENCENTCLOUD_SECRET_KEY;
    delete process.env.TENCENTCLOUD_REGION;
    delete process.env.TENCENT_HUNYUAN_IMAGE_MODEL;
  });

  it("throws when config is missing", () => {
    expect(() => createTencentHunyuanImageClient()).toThrow(TencentHunyuanImageConfigError);
  });

  it("normalizes succeeded, failed, and running jobs", () => {
    expect(normalizeTencentImageJob({ JobStatusCode: "5", ResultImage: ["https://example.com/a.png"] })).toEqual({
      status: "succeeded",
      imageUrl: "https://example.com/a.png",
      failureReason: null,
    });

    expect(normalizeTencentImageJob({ JobStatusCode: "6", JobErrorMsg: "blocked" })).toEqual({
      status: "failed",
      imageUrl: null,
      failureReason: "blocked",
    });

    expect(normalizeTencentImageJob({ JobStatusCode: "4" })).toEqual({
      status: "generating",
      imageUrl: null,
      failureReason: null,
    });
  });

  it("submits a job through Tencent API", async () => {
    process.env.TENCENTCLOUD_SECRET_ID = "id";
    process.env.TENCENTCLOUD_SECRET_KEY = "key";
    process.env.TENCENTCLOUD_REGION = "ap-guangzhou";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hunyuan-image";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ Response: { JobId: "job-1", RequestId: "request-1" } }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.submit({ prompt: "A picture-book scene.", width: 1024, height: 768 });

    expect(result).toEqual({ taskId: "job-1" });
    expect(fetch).toHaveBeenCalledWith(
      "https://hunyuan.tencentcloudapi.com",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json; charset=utf-8",
          Host: "hunyuan.tencentcloudapi.com",
          "X-TC-Action": expect.any(String),
        }),
      }),
    );
  });

  it("queries a job through Tencent API", async () => {
    process.env.TENCENTCLOUD_SECRET_ID = "id";
    process.env.TENCENTCLOUD_SECRET_KEY = "key";
    process.env.TENCENTCLOUD_REGION = "ap-guangzhou";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hunyuan-image";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          Response: {
            JobStatusCode: "5",
            ResultImage: ["https://example.com/a.png"],
            RequestId: "request-1",
          },
        }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.query({ taskId: "job-1" });

    expect(result).toEqual({ status: "succeeded", imageUrl: "https://example.com/a.png", failureReason: null });
  });
});
