import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQuickRouterImageClient, QuickRouterImageConfigError } from "./quickrouter-image";

describe("QuickRouter GPT-image-2 client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.QUICKROUTER_API_KEY;
    delete process.env.QUICKROUTER_IMAGE_MODEL;
    delete process.env.QUICKROUTER_IMAGE_QUALITY;
  });

  it("throws when API key is missing", () => {
    expect(() => createQuickRouterImageClient()).toThrow(QuickRouterImageConfigError);
  });

  it("creates a GPT-image-2 image synchronously", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ url: "https://example.com/image.webp" }] }),
      })),
    );

    const client = createQuickRouterImageClient();
    const result = await client.submit({ prompt: "A warm classroom illustration.", width: 1280, height: 720 });

    expect(result).toEqual({ imageUrl: "https://example.com/image.webp" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.quickrouter.ai/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string) as { model: string; prompt: string; n: number; size: string; quality: string; format: string };
    expect(body).toMatchObject({
      model: "gpt-image-2",
      n: 1,
      size: "1536x1024",
      quality: "medium",
      format: "webp",
    });
    expect(body.prompt).toContain("A warm classroom illustration");
    expect(body.prompt.length).toBeLessThanOrEqual(1000);
  });

  it("surfaces QuickRouter API errors", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "invalid api key" } }),
      })),
    );

    const client = createQuickRouterImageClient();

    await expect(client.submit({ prompt: "A scene.", width: 1280, height: 720 })).rejects.toThrow("invalid api key");
  });

  it("allows image quality to be overridden from the environment", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";
    process.env.QUICKROUTER_IMAGE_QUALITY = "low";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ b64_json: "abc" }] }),
      })),
    );

    const client = createQuickRouterImageClient();
    await client.submit({ prompt: "A scene.", width: 1280, height: 720 });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string) as { quality: string };
    expect(body.quality).toBe("low");
  });
});
