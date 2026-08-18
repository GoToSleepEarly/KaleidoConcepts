import { afterEach, describe, expect, test, vi } from "vitest";

import {
  StoryOutlineIncompleteResponseError,
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
  test("uses the dedicated text token", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "text-key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    });

    const init = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer text-key");
  });

  test("uses the configured GPT model for GPT writing", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
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
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
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

  test("returns provider token usage for cost diagnostics", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      output_text: "{\"ok\":true}",
      usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200, output_tokens_details: { reasoning_tokens: 60 } },
    })));

    const result = await createStoryOutlineProvider().generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成正文" });

    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 80, visibleOutputTokens: 20, reasoningTokens: 60, totalTokens: 200 });
  });

  test("reports an incomplete provider response before downstream JSON parsing", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: "{\"visualStyle\":",
      usage: { input_tokens: 100, output_tokens: 8000, total_tokens: 8100, output_tokens_details: { reasoning_tokens: 6500 } },
    })));

    const result = createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成视觉方案",
    });
    await expect(result).rejects.toBeInstanceOf(StoryOutlineIncompleteResponseError);
    await expect(result).rejects.toMatchObject({
      usage: { inputTokens: 100, outputTokens: 8000, visibleOutputTokens: 1500, reasoningTokens: 6500, totalTokens: 8100 },
    });
  });

  test("uses the configured DeepSeek model for DeepSeek writing", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
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
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    process.env.QUICKROUTER_RESEARCH_MODEL = "research-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().searchReference({ prompt: "整理特朗普资料" });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("research-model");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  test("throws a business configuration error when QuickRouter key is missing", () => {
    delete process.env.QUICKROUTER_TEXT_API_KEY;

    expect(() => createStoryOutlineProvider()).toThrow(StoryOutlineProviderConfigError);
    expect(() => createStoryOutlineProvider()).toThrow("故事大纲服务尚未配置");
  });

  test("supports a bounded low-reasoning request for structured visual plans", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成视觉方案",
      reasoningEffort: "low",
      maxOutputTokens: 8_000,
    });

    expect(fetchBody(fetchMock)).toMatchObject({ reasoning: { effort: "low" }, max_output_tokens: 8_000 });
  });

  test("retries once when the connection times out before a request is established", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
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
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
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
