import { afterEach, describe, expect, test, vi } from "vitest";

import { PersonVisualProviderConfigError, createPersonVisualProvider } from "./person-visual-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("person visual provider", () => {
  test("uses the dedicated image token and ignores the legacy shared token", async () => {
    process.env.QUICKROUTER_IMAGE_API_KEY = "image-key";
    process.env.QUICKROUTER_API_KEY = "legacy-key";
    const request = vi.fn(async () => Response.json({ data: [{ url: "https://example.com/person.webp" }] }));
    vi.stubGlobal("fetch", request);

    await createPersonVisualProvider().generate({ prompt: "full body" });

    const init = (request.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer image-key");
  });

  test("does not fall back to the legacy shared token", () => {
    delete process.env.QUICKROUTER_IMAGE_API_KEY;
    process.env.QUICKROUTER_API_KEY = "legacy-key";

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
      quality: "low",
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
      quality: "low",
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
});
