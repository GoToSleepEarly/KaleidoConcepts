import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: (input: Parameters<typeof actual.fetch>[0], init?: Parameters<typeof actual.fetch>[1]) => globalThis.fetch(input as RequestInfo, init as RequestInit) as unknown as ReturnType<typeof actual.fetch>,
  };
});

import { AiProviderResultUnknownError, StoryOutlineIncompleteResponseError, StoryOutlineProviderConfigError, createStoryOutlineProvider, textTransportTimeoutMs } from "./story-outline-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function mockTextResponse(text = '{"ok":true}') {
  return vi.fn(async () =>
    Response.json({
      output_text: text,
    }),
  );
}

function streamResponse(events: unknown[]) {
  return new Response(events.map((event) => `event: ${Reflect.get(event as object, "type") ?? "message"}\ndata: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function timedStreamResponse(chunks: Array<{ at: number; text: string }>, closeAt: number) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) setTimeout(() => controller.enqueue(encoder.encode(chunk.text)), chunk.at);
      setTimeout(() => controller.close(), closeAt);
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
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
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });

    const init = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer text-key");
  });

  test("routes QuickRouter text and research requests through the selected direct endpoint", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "text-key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStoryOutlineProvider(undefined, {
      aiGateway: "quickrouter",
      quickRouterEndpoint: "direct",
    });

    await provider.generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });
    await provider.searchReference({ prompt: "整理资料" });

    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.quickrouter.us/v1/responses");
    expect((fetchMock.mock.calls[1] as unknown[] | undefined)?.[0]).toBe("https://api.quickrouter.us/v1/responses");
  });

  test("uses the account-selected canonical GPT model instead of legacy environment overrides", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    process.env.QUICKROUTER_GPT_TEXT_MODEL = "gpt-model";
    process.env.QUICKROUTER_RESEARCH_MODEL = "research-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });
    await createStoryOutlineProvider().searchReference({
      writingProvider: "gpt-5.5",
      prompt: "整理资料",
    });

    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.6-sol");
    expect(fetchBody(fetchMock, 1).model).toBe("gpt-5.5");
    expect(timeoutSpy).toHaveBeenCalledWith(600_000);
  });

  test("defaults GPT writing and research to GPT-5.6 Sol", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    delete process.env.QUICKROUTER_GPT_TEXT_MODEL;
    delete process.env.QUICKROUTER_RESEARCH_MODEL;
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });
    await createStoryOutlineProvider().searchReference({ prompt: "整理资料" });

    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.6-sol");
    expect(fetchBody(fetchMock, 1).model).toBe("gpt-5.6-sol");
  });

  test("uses the account non-stream timeout and ignores legacy text timeout environment variables", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    process.env.TEXT_GENERATION_TIMEOUT_MS = "1";
    process.env.COURSE_CONTENT_GENERATION_TIMEOUT_MS = "2";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await createStoryOutlineProvider(undefined, {
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      textStreamingEnabled: false,
      textNonStreamTimeoutSeconds: 360,
    }).generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成较长的课程正文",
    });

    expect(timeoutSpy).toHaveBeenCalledWith(360_000);
    const init = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as (RequestInit & { dispatcher?: unknown }) | undefined;
    expect(init?.dispatcher).toBeDefined();
    expect(textTransportTimeoutMs(360_000)).toBe(390_000);
  });

  test("sends GPT-5.5 with its exact canonical model name", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.5",
      prompt: "生成大纲",
    });

    expect(fetchBody(fetchMock).model).toBe("gpt-5.5");
  });

  test("routes Easy88AI text requests through its preset endpoint", async () => {
    process.env.EASY88AI_TEXT_API_KEY = "easy-text-key";
    process.env.EASY88AI_GPT_TEXT_MODEL = "legacy-writing-model";
    process.env.EASY88AI_RESEARCH_MODEL = "legacy-research-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    const provider = createStoryOutlineProvider(undefined, "easy88ai");
    await provider.generateOutline({
      writingProvider: "gpt-5.5",
      prompt: "生成大纲",
    });
    await provider.searchReference({
      writingProvider: "gpt-5.5",
      prompt: "整理资料",
    });

    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.easy88ai.com/v1/responses");
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer easy-text-key");
    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.5");
    expect(fetchBody(fetchMock, 1).model).toBe("gpt-5.5");
    expect(fetchBody(fetchMock, 0).stream).toBeUndefined();
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Accept")).toBe("application/json");
  });

  test("aggregates an Easy88AI Responses stream without changing the provider result", async () => {
    process.env.EASY88AI_TEXT_API_KEY = "easy-text-key";
    const completedResponse = {
      status: "completed",
      output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }],
      usage: {
        input_tokens: 12,
        output_tokens: 8,
        total_tokens: 20,
        output_tokens_details: { reasoning_tokens: 3 },
      },
    };
    const fetchMock = vi.fn(async () => streamResponse([
      { type: "response.output_text.delta", delta: '{"ok":' },
      { type: "response.output_text.delta", delta: "true}" },
      { type: "response.completed", response: completedResponse },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createStoryOutlineProvider(undefined, { aiGateway: "easy88ai", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({
      writingProvider: "gpt-5.5",
      prompt: "生成正文",
    });

    expect(fetchBody(fetchMock)).toMatchObject({ model: "gpt-5.5", stream: true });
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Accept")).toBe("text/event-stream");
    expect(result).toEqual({
      text: '{"ok":true}',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        visibleOutputTokens: 5,
        reasoningTokens: 3,
        totalTokens: 20,
      },
    });
  });

  test("uses the account text stream setting for every provider", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "quick-key";
    process.env.CRAZYROUTER_TEXT_API_KEY = "crazy-key";
    process.env.EASY88AI_TEXT_API_KEY = "easy-key";
    process.env.DEEPSEEK_TEXT_API_KEY = "deepseek-key";
    const fetchMock = vi.fn(async () => streamResponse([
      { type: "response.output_text.delta", delta: '{"ok":true}' },
      { type: "response.completed", response: { status: "completed" } },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider(undefined, { aiGateway: "quickrouter", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({ writingProvider: "gpt-5.6-sol", prompt: "quick" });
    await createStoryOutlineProvider(undefined, { aiGateway: "crazyrouter", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({ writingProvider: "gpt-5.6-sol", prompt: "crazy" });
    await createStoryOutlineProvider(undefined, { aiGateway: "easy88ai", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({ writingProvider: "gpt-5.6-sol", prompt: "easy" });
    await createStoryOutlineProvider(undefined, { aiGateway: "quickrouter", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({ writingProvider: "deepseek-v4-pro", prompt: "deepseek" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 4; index += 1) expect(fetchBody(fetchMock, index).stream).toBe(true);
  });

  test("does not accept a partial stream without a completion event", async () => {
    process.env.EASY88AI_TEXT_API_KEY = "easy-text-key";
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      { type: "response.output_text.delta", delta: '{"partial":true}' },
    ])));

    await expect(createStoryOutlineProvider(undefined, { aiGateway: "easy88ai", quickRouterEndpoint: "main", textReasoningEffort: "medium", textStreamingEnabled: true }).generateOutline({
      writingProvider: "gpt-5.5",
      prompt: "生成正文",
    })).rejects.toBeInstanceOf(AiProviderResultUnknownError);
  });

  test("lets an active stream run beyond one idle window by resetting on every valid event", async () => {
    vi.useFakeTimers();
    process.env.EASY88AI_TEXT_API_KEY = "easy-text-key";
    vi.stubGlobal("fetch", vi.fn(async () => timedStreamResponse([
      { at: 10, text: 'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":"}\n\n' },
      { at: 35, text: 'data: {"type":"response.output_text.delta","delta":"true}"}\n\n' },
      { at: 60, text: 'data: {"type":"response.completed","response":{"status":"completed"}}\n\n' },
    ], 65)));

    const resultPromise = createStoryOutlineProvider({
      apiKey: "easy-text-key",
      baseUrl: "https://example.test",
      gptModel: "gpt-5.5",
      researchModel: "gpt-5.5",
      stream: true,
      streamFirstEventTimeoutMs: 20,
      streamIdleTimeoutMs: 30,
      streamMaxDurationMs: 100,
    }).generateOutline({ writingProvider: "gpt-5.5", prompt: "生成正文" });
    await vi.advanceTimersByTimeAsync(70);

    await expect(resultPromise).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  test("marks a stream result unknown when no new valid event arrives within the idle timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => timedStreamResponse([
      { at: 1, text: 'data: {"type":"response.output_text.delta","delta":"partial"}\n\n' },
    ], 100)));

    const resultPromise = createStoryOutlineProvider({
      apiKey: "key",
      baseUrl: "https://example.test",
      gptModel: "gpt-5.5",
      researchModel: "gpt-5.5",
      stream: true,
      streamFirstEventTimeoutMs: 20,
      streamIdleTimeoutMs: 30,
      streamMaxDurationMs: 100,
    }).generateOutline({ writingProvider: "gpt-5.5", prompt: "生成正文" });
    const assertion = expect(resultPromise).rejects.toThrow("长时间没有新事件");
    await vi.advanceTimersByTimeAsync(40);

    await assertion;
  });

  test("marks a stream result unknown when the first valid event does not arrive in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => timedStreamResponse([], 100)));

    const resultPromise = createStoryOutlineProvider({
      apiKey: "key",
      baseUrl: "https://example.test",
      gptModel: "gpt-5.5",
      researchModel: "gpt-5.5",
      stream: true,
      streamFirstEventTimeoutMs: 20,
      streamIdleTimeoutMs: 30,
      streamMaxDurationMs: 100,
    }).generateOutline({ writingProvider: "gpt-5.5", prompt: "生成正文" });
    const assertion = expect(resultPromise).rejects.toThrow("等待首个流式事件超时");
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  test("enforces the stream hard limit even when heartbeat events keep the connection active", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => timedStreamResponse([
      { at: 1, text: ": heartbeat\n\n" },
      { at: 15, text: ": heartbeat\n\n" },
      { at: 30, text: ": heartbeat\n\n" },
      { at: 45, text: ": heartbeat\n\n" },
    ], 100)));

    const resultPromise = createStoryOutlineProvider({
      apiKey: "key",
      baseUrl: "https://example.test",
      gptModel: "gpt-5.5",
      researchModel: "gpt-5.5",
      stream: true,
      streamFirstEventTimeoutMs: 20,
      streamIdleTimeoutMs: 20,
      streamMaxDurationMs: 50,
    }).generateOutline({ writingProvider: "gpt-5.5", prompt: "生成正文" });
    const assertion = expect(resultPromise).rejects.toThrow("超过最长运行时间");
    await vi.advanceTimersByTimeAsync(55);

    await assertion;
  });

  test("does not retry when response headers time out after the provider may have accepted the request", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const headersTimeout = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Headers Timeout Error"), {
        code: "UND_ERR_HEADERS_TIMEOUT",
      }),
    });
    const fetchMock = vi.fn().mockRejectedValue(headersTimeout);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createStoryOutlineProvider().generateOutline({
        writingProvider: "gpt-5.6-sol",
        prompt: "生成较长的课程正文",
      }),
    ).rejects.toBeInstanceOf(AiProviderResultUnknownError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns provider token usage for cost diagnostics", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          output_text: '{"ok":true}',
          usage: {
            input_tokens: 120,
            output_tokens: 80,
            total_tokens: 200,
            output_tokens_details: { reasoning_tokens: 60 },
          },
        }),
      ),
    );

    const result = await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成正文",
    });

    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      visibleOutputTokens: 20,
      reasoningTokens: 60,
      totalTokens: 200,
    });
  });

  test("reports an incomplete provider response before downstream JSON parsing", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output_text: '{"visualStyle":',
          usage: {
            input_tokens: 100,
            output_tokens: 8000,
            total_tokens: 8100,
            output_tokens_details: { reasoning_tokens: 6500 },
          },
        }),
      ),
    );

    const result = createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成视觉方案",
    });
    await expect(result).rejects.toBeInstanceOf(StoryOutlineIncompleteResponseError);
    await expect(result).rejects.toMatchObject({
      usage: {
        inputTokens: 100,
        outputTokens: 8000,
        visibleOutputTokens: 1500,
        reasoningTokens: 6500,
        totalTokens: 8100,
      },
    });
  });

  test("uses the preset DeepSeek Responses endpoint instead of a legacy environment override", async () => {
    process.env.DEEPSEEK_TEXT_API_KEY = "deepseek-text-key";
    process.env.DEEPSEEK_MODEL = "legacy-environment-model";
    process.env.DEEPSEEK_BASE_URL = "https://deepseek.example/v1/";
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: '{"ok":true}',
        usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createStoryOutlineProvider().generateOutline({
      writingProvider: "deepseek-v4-pro",
      prompt: "生成大纲",
      maxOutputTokens: 2_000,
    });

    const body = fetchBody(fetchMock);
    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.deepseek.com/responses");
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer deepseek-text-key");
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.input).toBe("生成大纲");
    expect(body.max_output_tokens).toBe(2_000);
    expect(result).toEqual({
      text: '{"ok":true}',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        visibleOutputTokens: 8,
        reasoningTokens: 0,
        totalTokens: 20,
      },
    });
  });

  test("uses the account-selected model for reference search", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    process.env.QUICKROUTER_RESEARCH_MODEL = "research-model";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().searchReference({
      writingProvider: "gpt-5.5",
      prompt: "整理特朗普资料",
    });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  test("adds the shared max output limit to every text request that does not set one", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStoryOutlineProvider();

    await provider.generateOutline({ writingProvider: "gpt-5.6-sol", prompt: "生成大纲" });
    await provider.searchReference({ writingProvider: "gpt-5.6-sol", prompt: "整理资料" });

    expect(fetchBody(fetchMock, 0).max_output_tokens).toBe(16_500);
    expect(fetchBody(fetchMock, 1).max_output_tokens).toBe(16_500);
  });

  test("throws a business configuration error when QuickRouter key is missing", async () => {
    delete process.env.QUICKROUTER_TEXT_API_KEY;

    expect(() =>
      createStoryOutlineProvider().generateOutline({
        writingProvider: "gpt-5.6-sol",
        prompt: "生成大纲",
      }),
    ).toThrow(StoryOutlineProviderConfigError);
    expect(() =>
      createStoryOutlineProvider().generateOutline({
        writingProvider: "gpt-5.6-sol",
        prompt: "生成大纲",
      }),
    ).toThrow("故事大纲服务尚未配置");
  });

  test("routes DeepSeek writing and web search through the official Responses API", async () => {
    process.env.CRAZYROUTER_TEXT_API_KEY = "crazy-text-key";
    process.env.DEEPSEEK_TEXT_API_KEY = "deepseek-text-key";
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
    delete process.env.DEEPSEEK_MODEL;
    const fetchMock = vi.fn(async () => Response.json({ output_text: '{"ok":true}' }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createStoryOutlineProvider(undefined, "crazyrouter");

    await provider.generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });
    await provider.searchReference({ writingProvider: "gpt-5.6-sol", prompt: "整理资料" });
    await provider.generateOutline({
      writingProvider: "deepseek-v4-pro",
      prompt: "生成大纲",
    });
    await provider.searchReference({ writingProvider: "deepseek-v4-pro", prompt: "整理资料" });

    expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/responses");
    expect(fetchBody(fetchMock, 0).model).toBe("gpt-5.6-sol");
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer crazy-text-key");
    expect((fetchMock.mock.calls[1] as unknown[] | undefined)?.[0]).toBe("https://api.crazyrouter.com/v1/responses");
    expect(fetchBody(fetchMock, 1)).toMatchObject({
      model: "gpt-5.6-sol",
      tools: [{ type: "web_search" }],
    });
    expect((fetchMock.mock.calls[2] as unknown[] | undefined)?.[0]).toBe("https://api.deepseek.com/responses");
    expect(new Headers(((fetchMock.mock.calls[2] as unknown[] | undefined)?.[1] as RequestInit | undefined)?.headers).get("Authorization")).toBe("Bearer deepseek-text-key");
    expect(fetchBody(fetchMock, 2)).toMatchObject({ model: "deepseek-v4-pro", input: "生成大纲" });
    expect((fetchMock.mock.calls[3] as unknown[] | undefined)?.[0]).toBe("https://api.deepseek.com/responses");
    expect(fetchBody(fetchMock, 3)).toMatchObject({
      model: "deepseek-v4-pro",
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
    });
  });

  test("supports a bounded low-reasoning request for structured visual plans", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成视觉方案",
      reasoningEffort: "low",
      maxOutputTokens: 8_000,
    });

    expect(fetchBody(fetchMock)).toMatchObject({
      reasoning: { effort: "low" },
      max_output_tokens: 8_000,
    });
  });

  test("account reasoning strength overrides operation defaults", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const fetchMock = mockTextResponse();
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider(undefined, {
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      textReasoningEffort: "high",
      textStreamingEnabled: false,
    }).generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成视觉方案",
      reasoningEffort: "low",
    });

    expect(fetchBody(fetchMock)).toMatchObject({ reasoning: { effort: "high" } });
  });

  test("retries once when the connection times out before a request is established", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const connectionError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), {
        code: "UND_ERR_CONNECT_TIMEOUT",
      }),
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(Response.json({ output_text: '{"ok":true}' }));
    vi.stubGlobal("fetch", fetchMock);

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
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

    await expect(
      createStoryOutlineProvider().generateOutline({
        writingProvider: "gpt-5.6-sol",
        prompt: "生成大纲",
      }),
    ).rejects.toThrow("故事大纲服务连接失败，请稍后重试");

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

    const generation = createStoryOutlineProvider().generateOutline({
      writingProvider: "gpt-5.6-sol",
      prompt: "生成大纲",
    });

    await expect(generation).rejects.toBeInstanceOf(AiProviderResultUnknownError);
    await expect(generation).rejects.toThrow("故事大纲服务响应中断，生成结果未能确认，请手动重试本步");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("reports a response body timeout as an unknown result", async () => {
    process.env.QUICKROUTER_TEXT_API_KEY = "key";
    const bodyTimeout = Object.assign(new Error("Body Timeout Error"), {
      code: "UND_ERR_BODY_TIMEOUT",
    });
    const response = {
      ok: true,
      status: 200,
      text: vi.fn().mockRejectedValue(bodyTimeout),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createStoryOutlineProvider().generateOutline({
        writingProvider: "gpt-5.6-sol",
        prompt: "生成大纲",
      }),
    ).rejects.toBeInstanceOf(AiProviderResultUnknownError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
