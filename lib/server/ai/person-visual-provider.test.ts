import { afterEach, describe, expect, test, vi } from "vitest";

import { PersonVisualProviderConfigError, createPersonVisualProvider } from "./person-visual-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("person visual provider", () => {
  test("uses the dedicated image token", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ data: [{ url: "https://example.com/person.webp" }] });
    });
    vi.stubGlobal("fetch", request);

    await createPersonVisualProvider().generate({ prompt: "full body" });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer image-key");
  });

  test("QuickRouter 人物形象请求使用账号选择的直连地址", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/person.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createPersonVisualProvider(undefined, { aiGateway: "quickrouter", quickRouterEndpoint: "direct" }).generate({ prompt: "full body" });

    expect((request.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.quickrouter.us/v1/images/generations");
  });

  test("非固定按张收费模型的人物造型保持 low", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    process.env.QUICKROUTER_IMAGE_QUALITY = "high";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/person.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createPersonVisualProvider().generate({ prompt: "full body" });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.quality).toBe("low");
  });

  test("gpt-image-2-c 生成人物形象时强制最高质量", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ data: [{ url: "https://example.com/person.webp" }] });
    });
    vi.stubGlobal("fetch", request);

    await createPersonVisualProvider({ apiKey: "test", model: "gpt-image-2-c", timeoutMs: 1_000 }).generate({ prompt: "person" });

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "gpt-image-2-c", quality: "high" });
  });

  test("requires the dedicated image token", () => {
    delete process.env.QUICKROUTER_IMAGE_API_KEY;

    expect(() => createPersonVisualProvider()).toThrow(PersonVisualProviderConfigError);
  });

  test("requests one portrait image for a full-body character", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/full-body.webp" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", request);

    const provider = createPersonVisualProvider({
      apiKey: "test",
      model: "gpt-image-2",
      timeoutMs: 1_000,
    });
    await provider.generate({ prompt: "full body" });

    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ n: 1, size: "1024x1536", format: "webp" });
  });

  test("sends image edits as multipart form data required by the live gateway", async () => {
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/edited.webp" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", request);

    const provider = createPersonVisualProvider({
      apiKey: "test",
      model: "gpt-image-2",
      timeoutMs: 1_000,
    });
    await provider.edit({
      prompt: "change the coat",
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
    });

    const options = request.mock.calls[0]?.[1];
    const body = options?.body as FormData;
    expect(body.get("model")).toBe("gpt-image-2");
    expect(body.get("prompt")).toBe("change the coat");
    expect(body.get("n")).toBe("1");
    expect(body.get("size")).toBe("1024x1536");
    expect(body.get("quality")).toBe("low");
    expect(body.get("image")).toBeInstanceOf(Blob);
    expect(body.has("format")).toBe(false);
    expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
  });

  test("人物形象接口返回 429 时也仅用 gpt-image-2-c 兜底一次", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: "https://example.com/fallback.webp" }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createPersonVisualProvider({ apiKey: "test", model: "gpt-image-2", timeoutMs: 1_000 });

    await expect(provider.edit({ prompt: "change the coat", imageDataUrl: "data:image/png;base64,aGVsbG8=" })).resolves.toEqual({ imageUrl: "https://example.com/fallback.webp", model: "gpt-image-2-c", quality: "high" });

    expect(request).toHaveBeenCalledTimes(2);
    expect((request.mock.calls[0]?.[1]?.body as FormData).get("model")).toBe("gpt-image-2");
    expect((request.mock.calls[1]?.[1]?.body as FormData).get("model")).toBe("gpt-image-2-c");
  });

  test("Crazyrouter 人物形象使用标准模型且不启用 -c 兜底", async () => {
    process.env.CRAZYROUTER_API_KEY = "crazy-key";
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }));
    vi.stubGlobal("fetch", request);

    await expect(createPersonVisualProvider(undefined, "crazyrouter").generate({ prompt: "person" })).rejects.toThrow("rate limited");

    expect(request).toHaveBeenCalledTimes(1);
    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect((request.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/images/generations");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer crazy-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-image-2", quality: "low", output_format: "webp" });
  });
});
