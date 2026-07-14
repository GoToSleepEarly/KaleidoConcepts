import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQuickRouterImageClient, QuickRouterImageConfigError } from "./quickrouter-image";

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("QuickRouter GPT-image-2 client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.QUICKROUTER_API_KEY;
    delete process.env.QUICKROUTER_IMAGE_MODEL;
    delete process.env.QUICKROUTER_IMAGE_QUALITY;
    delete process.env.IMAGE_GENERATION_TIMEOUT_MS;
  });

  it("throws when API key is missing", () => {
    expect(() => createQuickRouterImageClient()).toThrow(QuickRouterImageConfigError);
  });

  it("creates a GPT-image-2 image synchronously", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(200, { data: [{ url: "https://example.com/image.webp" }] })),
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
      size: "1536x864",
      quality: "low",
      format: "webp",
    });
    expect(body.prompt).toContain("A warm classroom illustration");
    expect(body.prompt.length).toBeLessThanOrEqual(1200);
  });

  it("passes an AbortSignal timeout to the generation request", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";
    process.env.IMAGE_GENERATION_TIMEOUT_MS = "1234";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(200, { data: [{ url: "https://example.com/image.webp" }] })),
    );

    const client = createQuickRouterImageClient();
    await client.submit({ prompt: "A scene.", width: 1280, height: 720 });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries on timeout and eventually fails with a retry-exhausted message", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;
        const error = new Error("aborted");
        error.name = "TimeoutError";
        throw error;
      }),
    );

    const client = createQuickRouterImageClient();

    await expect(client.submit({ prompt: "A scene.", width: 1280, height: 720 })).rejects.toThrow("重试");
    expect(callCount).toBe(2);
  });

  it("surfaces QuickRouter API errors", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(401, { error: { message: "invalid api key" } })),
    );

    const client = createQuickRouterImageClient();

    await expect(client.submit({ prompt: "A scene.", width: 1280, height: 720 })).rejects.toThrow("invalid api key");
  });

  it("allows image quality to be overridden from the environment", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";
    process.env.QUICKROUTER_IMAGE_QUALITY = "high";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(200, { data: [{ b64_json: "abc" }] })),
    );

    const client = createQuickRouterImageClient();
    await client.submit({ prompt: "A scene.", width: 1280, height: 720 });

    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string) as { quality: string };
    expect(body.quality).toBe("high");
  });

  it("retries once when the response is an empty 200 with no image data", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return mockResponse(200, {});
        }
        return mockResponse(200, { data: [{ url: "https://example.com/retry.webp" }] });
      }),
    );

    const client = createQuickRouterImageClient();
    const result = await client.submit({ prompt: "A scene.", width: 1280, height: 720 });

    expect(callCount).toBe(2);
    expect(result).toEqual({ imageUrl: "https://example.com/retry.webp" });
  });

  it("fails after exhausting retries on persistent empty responses", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(200, {})),
    );

    const client = createQuickRouterImageClient();

    await expect(client.submit({ prompt: "A scene.", width: 1280, height: 720 })).rejects.toThrow("重试");
  });

  it("does not retry 4xx client errors", async () => {
    process.env.QUICKROUTER_API_KEY = "secret";

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;
        return mockResponse(400, { error: { message: "bad request" } });
      }),
    );

    const client = createQuickRouterImageClient();
    await expect(client.submit({ prompt: "A scene.", width: 1280, height: 720 })).rejects.toThrow("bad request");

    expect(callCount).toBe(1);
  });
});
