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

    await createStoryOutlineProvider().generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "生成大纲",
    });

    const body = fetchBody(fetchMock);
    expect(body.model).toBe("gpt-model");
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
});
