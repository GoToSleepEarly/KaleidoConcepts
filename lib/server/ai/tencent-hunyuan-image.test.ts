import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTencentHunyuanImageClient, TencentHunyuanImageConfigError } from "./tencent-hunyuan-image";

describe("Tencent HY-Image-Lite client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TENCENT_HUNYUAN_API_KEY;
    delete process.env.TENCENT_HUNYUAN_IMAGE_MODEL;
  });

  it("throws when API key is missing", () => {
    expect(() => createTencentHunyuanImageClient()).toThrow(TencentHunyuanImageConfigError);
  });

  it("generates an image URL through HY-Image-Lite", async () => {
    process.env.TENCENT_HUNYUAN_API_KEY = "secret";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hy-image-lite";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ url: "https://example.com/a.png" }] }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.generate({ prompt: "A picture-book scene.", width: 1024, height: 768 });

    expect(result).toEqual({ imageUrl: "https://example.com/a.png" });
    expect(fetch).toHaveBeenCalledWith(
      "https://tokenhub.tencentmaas.com/v1/api/image/lite",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "hy-image-lite",
          prompt: "A picture-book scene.",
          n: 1,
          size: "1024x768",
          rsp_img_type: "url",
        }),
      }),
    );
  });

  it("surfaces HY-Image-Lite API errors", async () => {
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

    await expect(client.generate({ prompt: "A scene.", width: 1024, height: 768 })).rejects.toThrow("invalid api key");
  });
});
