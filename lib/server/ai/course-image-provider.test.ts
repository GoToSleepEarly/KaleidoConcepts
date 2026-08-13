import { afterEach, describe, expect, test, vi } from "vitest";

import { createCourseImageProvider } from "./course-image-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("course image provider", () => {
  test("使用独立生图 token，不回退旧共享 token", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    process.env.QUICKROUTER_API_KEY = "legacy-key";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/image.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createCourseImageProvider().generate({ prompt: "scene", quality: "low" });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer image-key");
  });

  test("缺少独立生图 token 时不回退旧共享 token", () => {
    delete process.env.QUICKROUTER_IMAGE_API_KEY;
    process.env.QUICKROUTER_API_KEY = "legacy-key";

    expect(() => createCourseImageProvider()).toThrow("图片生成服务尚未配置");
  });

  test("把界面默认的高画质作为 medium 发送给横版图生图接口", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/image.webp" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000 });

    await provider.edit({ prompt: "scene", imageDataUrl: "data:image/webp;base64,aGVsbG8=", quality: "medium" });

    const options = request.mock.calls[0]?.[1];
    const body = options?.body as FormData;
    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("prompt")).toBe("scene");
    expect(body.get("n")).toBe("1");
    expect(body.get("size")).toBe("1536x1024");
    expect(body.get("quality")).toBe("medium");
    expect(body.get("image")).toBeInstanceOf(Blob);
    expect(body.has("format")).toBe(false);
    expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
  });

  test("上游负载饱和时有限退避重试并复用同一次生成请求", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Current group upstream load is saturated, please try again later (request id: first)" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Current group upstream load is saturated, please try again later (request id: second)" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://example.com/recovered.webp" }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrl: "data:image/webp;base64,aGVsbG8=", quality: "medium" })).resolves.toEqual({ imageUrl: "https://example.com/recovered.webp" });

    expect(request).toHaveBeenCalledTimes(3);
  });

  test("参数错误不重试", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Unknown parameter: 'format'." } }), { status: 400 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrl: "data:image/webp;base64,aGVsbG8=", quality: "medium" })).rejects.toThrow("Unknown parameter: 'format'.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  test("上游持续饱和时返回可操作的中文错误并保留请求编号", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Current group upstream load is saturated, please try again later (request id: final-id)" } }), { status: 429 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrl: "data:image/webp;base64,aGVsbG8=", quality: "medium" })).rejects.toThrow("图片生成服务繁忙，请稍后重试（request id: final-id）");
    expect(request).toHaveBeenCalledTimes(3);
  });

  test("原创角色首次生成使用竖版并保留实际质量", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/character.webp" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000 });

    await provider.generate({ prompt: "character", quality: "high", portrait: true });

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ quality: "high", size: "1024x1536", n: 1 });
  });
});
