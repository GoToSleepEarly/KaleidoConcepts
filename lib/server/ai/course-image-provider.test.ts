import { afterEach, describe, expect, test, vi } from "vitest";

import { createCourseImageProvider } from "./course-image-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("course image provider", () => {
  test("使用独立生图 token", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/image.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createCourseImageProvider().generate({ prompt: "scene", quality: "low" });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer image-key");
  });

  test("缺少独立生图 token 时返回配置错误", () => {
    delete process.env.QUICKROUTER_IMAGE_API_KEY;

    expect(() => createCourseImageProvider()).toThrow("图片生成服务尚未配置");
  });

  test("把界面默认的高画质作为 medium 发送给横版图生图接口", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ data: [{ url: "https://example.com/image.webp" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000 });

    await provider.edit({
      prompt: "scene",
      imageDataUrls: ["data:image/webp;base64,aGVsbG8=", "data:image/png;base64,d29ybGQ="],
      quality: "medium",
    });

    const options = request.mock.calls[0]?.[1];
    const body = options?.body as FormData;
    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("prompt")).toBe("scene");
    expect(body.get("n")).toBe("1");
    expect(body.get("size")).toBe("1536x1024");
    expect(body.get("quality")).toBe("medium");
    expect(body.getAll("image[]")).toHaveLength(2);
    expect(body.getAll("image[]").every((image) => image instanceof Blob)).toBe(true);
    expect(body.has("image")).toBe(false);
    expect(body.has("format")).toBe(false);
    expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
  });

  test("QuickRouter 返回 429 时仅用 gpt-image-2-c 兜底一次", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Current group upstream load is saturated, please try again later (request id: first)" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://example.com/recovered.webp" }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrls: ["data:image/webp;base64,aGVsbG8="], quality: "medium" })).resolves.toEqual({ imageUrl: "https://example.com/recovered.webp", model: "gpt-image-2-c", quality: "high" });

    expect(request).toHaveBeenCalledTimes(2);
    expect(((request.mock.calls[0]?.[1]?.body as FormData).get("model"))).toBe("gpt-image-2");
    expect(((request.mock.calls[1]?.[1]?.body as FormData).get("model"))).toBe("gpt-image-2-c");
    expect(((request.mock.calls[1]?.[1]?.body as FormData).get("quality"))).toBe("high");
  });

  test("Crazyrouter 使用标准图片协议且不会回退到 QuickRouter 专属模型", async () => {
    process.env.CRAZYROUTER_API_KEY = "crazy-key";
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider(undefined, "crazyrouter");

    await expect(provider.generate({ prompt: "scene", quality: "medium" })).rejects.toThrow("rate limited");

    expect(request).toHaveBeenCalledTimes(1);
    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect((request.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/images/generations");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer crazy-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-image-2", quality: "medium", output_format: "webp" });
  });

  test("Crazyrouter 图片编辑发送标准 multipart 参数", async () => {
    process.env.CRAZYROUTER_API_KEY = "crazy-key";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/edited.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createCourseImageProvider(undefined, "crazyrouter").edit({
      prompt: "change the object to green",
      imageDataUrls: ["data:image/png;base64,aGVsbG8=", "data:image/png;base64,d29ybGQ="],
      quality: "low",
    });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    const body = init?.body as FormData;
    expect((request.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/images/edits");
    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("size")).toBe("1536x1024");
    expect(body.get("quality")).toBe("low");
    expect(body.get("output_format")).toBe("webp");
    expect(body.getAll("image[]")).toHaveLength(2);
  });

  test("参数错误不重试", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Unknown parameter: 'format'." } }), { status: 400 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrls: ["data:image/webp;base64,aGVsbG8="], quality: "medium" })).rejects.toThrow("Unknown parameter: 'format'.");
    expect(request).toHaveBeenCalledTimes(1);
  });

  test("上游持续饱和时返回可操作的中文错误并保留请求编号", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Current group upstream load is saturated, please try again later (request id: final-id)" } }), { status: 429 }));
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.edit({ prompt: "scene", imageDataUrls: ["data:image/webp;base64,aGVsbG8="], quality: "medium" })).rejects.toThrow("图片生成服务繁忙，请稍后重试（request id: final-id）");
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("备用模型再次返回 429 后不继续重试", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
    });
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000, retryDelaysMs: [0, 0] });

    await expect(provider.generate({ prompt: "scene", quality: "medium" })).rejects.toThrow("rate limited");

    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "gpt-image-2" });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({ model: "gpt-image-2-c" });
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

  test("主模型为 gpt-image-2-c 时生成与编辑都强制最高质量", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ data: [{ url: "https://example.com/image.webp" }] });
    });
    vi.stubGlobal("fetch", request);
    const provider = createCourseImageProvider({ apiKey: "test", model: "gpt-image-2-c", timeoutMs: 1_000 });

    await provider.generate({ prompt: "scene", quality: "low" });
    await provider.edit({ prompt: "edit", imageDataUrls: ["data:image/webp;base64,aGVsbG8="], quality: "medium" });

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "gpt-image-2-c", quality: "high" });
    expect((request.mock.calls[1]?.[1]?.body as FormData).get("quality")).toBe("high");
  });
});
