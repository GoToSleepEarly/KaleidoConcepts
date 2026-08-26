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

  test("routes QuickRouter text and research requests through the selected direct endpoint", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "text-key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStoryOutlineProvider(undefined, { aiGateway: "quickrouter", quickRouterEndpoint: "direct" });

    await provider.generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成大纲" });
    await provider.searchReference({ prompt: "整理资料" });

    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.quickrouter.us/v1/responses");
    expect((fetchMock.mock.calls[1] as unknown[] | undefined)?.[0]).toBe("https://api.quickrouter.us/v1/responses");
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

  test("defaults GPT writing and research to GPT-5.6 Sol", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    delete process.env.QUICKROUTER_GPT_TEXT_MODEL;
    delete process.env.QUICKROUTER_RESEARCH_MODEL;
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成大纲" });
    await createStoryOutlineProvider().searchReference({ prompt: "整理资料" });

    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.6-sol");
    expect(fetchBody(fetchMock, 1).model).toBe("gpt-5.6-sol");
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
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    process.env.DEEPSEEK_MODEL = "deepseek-model";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.example/v1/";
    const fetchMock = vi.fn(async () => Response.json({
      choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_deepseek",
      prompt: "生成大纲",
      maxOutputTokens: 2_000,
    });

    const body = fetchBody(fetchMock);
    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://deepseek.example/v1/chat/completions");
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer deepseek-key");
    expect(body.model).toBe("deepseek-model");
    expect(body.messages).toEqual([{ role: "user", content: "生成大纲" }]);
    expect(body.max_tokens).toBe(2_000);
    expect(body.input).toBeUndefined();
    expect(result).toEqual({
      text: "{\"ok\":true}",
      usage: { inputTokens: 12, outputTokens: 8, visibleOutputTokens: 8, reasoningTokens: 0, totalTokens: 20 },
    });
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

  test("throws a business configuration error when QuickRouter key is missing", async () => {
    delete process.env.QUICKROUTER_TEXT_API_KEY;

    expect(() => createStoryOutlineProvider().generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成大纲" })).toThrow(StoryOutlineProviderConfigError);
    expect(() => createStoryOutlineProvider().generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成大纲" })).toThrow("故事大纲服务尚未配置");
  });

  test("routes only GPT writing and research through Crazyrouter while DeepSeek keeps its direct API", async () => {
    process.env.CRAZYROUTER_API_KEY = "crazy-key";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
    const fetchMock = vi.fn(async (url: string) => url.includes("deepseek")
      ? Response.json({ choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }] })
      : Response.json({ output_text: "{\"ok\":true}" }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStoryOutlineProvider(undefined, "crazyrouter");

    await provider.generateOutline({ writingProvider: "quickrouter_gpt", prompt: "生成大纲" });
    await provider.searchReference({ prompt: "整理资料" });
    await provider.generateOutline({ writingProvider: "quickrouter_deepseek", prompt: "生成大纲" });

    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/responses");
    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.6-sol");
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer crazy-key");
    expect((fetchMock.mock.calls[1] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/responses");
    expect(fetchBody(fetchMock, 1)).toMatchObject({ model: "gpt-5.6-sol", tools: [{ type: "web_search" }] });
    expect((fetchMock.mock.calls[2] as unknown[] | undefined)?.[0]).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(((fetchMock.mock.calls[2] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer deepseek-key");
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

  test("reports an interrupted response body without automatically paying for a second request", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const socketError = Object.assign(new Error("other side closed"), {
      name: "SocketError",
      code: "UND_ERR_SOCKET",
    });
    const response = {
      ok: true,
      status: 200,
      text: vi.fn().mockRejectedValue(socketError),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    })).rejects.toThrow("故事大纲服务响应中断，未收到完整结果，请重试本步");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
