import { describe, expect, test } from "vitest";

import { aiProviderBaseUrl, defaultTextTimeoutSettings, imageQualityForSelection, isImageSelectionSupported, isTextTimeoutSettingsValid, reasoningEffortsForModel, upstreamTextModel } from "./ai-gateway";

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

  test("centralizes model-dependent reasoning and image quality capabilities", () => {
    expect(reasoningEffortsForModel("gpt-5.6-sol")).toEqual(["low", "medium", "high"]);
    expect(reasoningEffortsForModel("deepseek-v4-pro")).toEqual(["low", "medium", "high"]);
    expect(imageQualityForSelection("gpt-image-2", "medium")).toBe("medium");
    expect(imageQualityForSelection("gpt-image-2-c", "low")).toBe("high");
  });

  test("defines valid account defaults and rejects a stream hard limit below an activity timeout", () => {
    const defaults = defaultTextTimeoutSettings();
    expect(defaults).toEqual({
      textStreamFirstEventTimeoutSeconds: 120,
      textStreamIdleTimeoutSeconds: 180,
      textStreamMaxDurationSeconds: 1_200,
      textNonStreamTimeoutSeconds: 600,
    });
    expect(isTextTimeoutSettingsValid(defaults)).toBe(true);
    expect(isTextTimeoutSettingsValid({ ...defaults, textStreamMaxDurationSeconds: 180 })).toBe(false);
  });
});
