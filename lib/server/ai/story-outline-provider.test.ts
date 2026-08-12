import { afterEach, describe, expect, test, vi } from "vitest";

import {
  StoryOutlineProviderConfigError,
  createStoryOutlineProvider,
} from "./story-outline-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function mockTextResponse(text = "{\"ok\":true}") {
  return vi.fn(async () =>
    Response.json({
      output_text: text,
    }),
  );
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

describe("createStoryOutlineProvider", () => {
  test("uses the configured GPT model for GPT writing", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    process.env.QUICKROUTER_GPT_TEXT_MODEL = "gpt-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("gpt-model");
    expect(timeoutSpy).toHaveBeenCalledWith(600_000);
  });

  test("allows a large generation request to override the default timeout", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成较长的课程正文",
      timeoutMs: 360_000,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(360_000);
  });

  test("uses the configured DeepSeek model for DeepSeek writing", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    process.env.QUICKROUTER_DEEPSEEK_TEXT_MODEL = "deepseek-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_deepseek",
      prompt: "生成大纲",
    });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("deepseek-model");
  });

  test("uses the configured research model for reference search", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    process.env.QUICKROUTER_RESEARCH_MODEL = "research-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().searchReference({ prompt: "整理特朗普资料" });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("research-model");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  test("throws a business configuration error when QuickRouter key is missing", () => {
    delete process.env.QUICKROUTER_API_KEY;

    expect(() => createStoryOutlineProvider()).toThrow(StoryOutlineProviderConfigError);
    expect(() => createStoryOutlineProvider()).toThrow("故事大纲服务尚未配置");
  });

  test("retries once when the connection times out before a request is established", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    const connectionError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(Response.json({ output_text: "{\"ok\":true}" }));
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not retry an ambiguous connection reset that may have reached the provider", async () => {
    process.env.QUICKROUTER_API_KEY = "key";
    const connectionError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
    });
    const fetchMock = vi.fn().mockRejectedValue(connectionError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    })).rejects.toThrow("故事大纲服务连接失败，请稍后重试");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
