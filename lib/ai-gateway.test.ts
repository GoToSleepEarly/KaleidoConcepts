import { describe, expect, test } from "vitest";

import { aiProviderBaseUrl, isImageSelectionSupported, upstreamTextModel } from "./ai-gateway";

describe("AI gateway preset catalog", () => {
  test("keeps Easy88AI as a fixed preset endpoint", () => {
    expect(aiProviderBaseUrl("easy88ai")).toBe("https://api.easy88ai.com");
  });

  test("keeps canonical text names unless a verified gateway alias is configured", () => {
    expect(upstreamTextModel("gpt-5.5", "easy88ai")).toBe("gpt-5.5");
    expect(upstreamTextModel("gpt-5.6-sol", "crazyrouter")).toBe("gpt-5.6-sol");
    expect(
      upstreamTextModel("gpt-5.5", "easy88ai", {
        easy88ai: { "gpt-5.5": "provider-gpt-5.5" },
      }),
    ).toBe("provider-gpt-5.5");
  });

  test("exposes Easy88AI for GPT Image 2 but keeps GPT Image 2-C on QuickRouter", () => {
    expect(isImageSelectionSupported("gpt-image-2-c", "quickrouter")).toBe(true);
    expect(isImageSelectionSupported("gpt-image-2-c", "crazyrouter")).toBe(false);
    expect(isImageSelectionSupported("gpt-image-2", "easy88ai")).toBe(true);
  });
});
