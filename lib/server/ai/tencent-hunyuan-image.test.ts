import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTencentHunyuanImageClient, TencentHunyuanImageConfigError } from "./tencent-hunyuan-image";

describe("Tencent HY-Image-V3 client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TENCENT_HUNYUAN_API_KEY;
    delete process.env.TENCENT_HUNYUAN_IMAGE_MODEL;
  });

  it("throws when API key is missing", () => {
    expect(() => createTencentHunyuanImageClient()).toThrow(TencentHunyuanImageConfigError);
  });

  it("submits an async image task through HY-Image-V3", async () => {
    process.env.TENCENT_HUNYUAN_API_KEY = "secret";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hy-image-v3.0";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: "task-1" }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.submit({ prompt: "A picture-book scene.", width: 1024, height: 768 });

    expect(result).toEqual({ taskId: "task-1" });
    expect(fetch).toHaveBeenCalledWith(
      "https://tokenhub.tencentmaas.com/v1/api/image/submit",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string) as { model: string; prompt: string; size: string; rsp_img_type: string };
    expect(body).toMatchObject({
      model: "hy-image-v3.0",
      size: "1024x768",
      rsp_img_type: "url",
    });
    expect(body.prompt).toContain("No text, no letters");
    expect(body.prompt.length).toBeLessThanOrEqual(2200);
  });

  it("queries a succeeded async image task", async () => {
    process.env.TENCENT_HUNYUAN_API_KEY = "secret";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hy-image-v3.0";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "succeeded", data: [{ url: "https://example.com/a.png" }] }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.query({ taskId: "task-1" });

    expect(result).toEqual({ status: "succeeded", imageUrl: "https://example.com/a.png", failureReason: null });
    expect(fetch).toHaveBeenCalledWith(
      "https://tokenhub.tencentmaas.com/v1/api/image/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "hy-image-v3.0", id: "task-1" }),
      }),
    );
  });

  it("normalizes generating and failed async statuses", async () => {
    process.env.TENCENT_HUNYUAN_API_KEY = "secret";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "running" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "failed", error: { message: "content rejected" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = createTencentHunyuanImageClient();

    await expect(client.query({ taskId: "task-1" })).resolves.toEqual({ status: "generating", imageUrl: null, failureReason: null });
    await expect(client.query({ taskId: "task-2" })).resolves.toEqual({ status: "failed", imageUrl: null, failureReason: "content rejected" });
  });

  it("surfaces HY-Image-V3 API errors", async () => {
    process.env.TENCENT_HUNYUAN_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "invalid api key" } }),
      })),
    );

    const client = createTencentHunyuanImageClient();

    await expect(client.submit({ prompt: "A scene.", width: 1024, height: 768 })).rejects.toThrow("invalid api key");
  });
});
