import { describe, expect, test } from "vitest";

import { aiProviderBaseUrl, billingModesForImageSelection, defaultTextTimeoutSettings, imageQualityForSelection, isImageSelectionSupported, isTextTimeoutSettingsValid, reasoningEffortsForModel, upstreamImageModel, upstreamTextModel } from "./ai-gateway";

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

  test("keeps canonical image models separate from provider billing aliases", () => {
    expect(billingModesForImageSelection("gpt-image-2", "quickrouter")).toEqual(["metered", "per_image"]);
    expect(billingModesForImageSelection("gpt-image-2.5-sunburst", "quickrouter")).toEqual(["metered", "per_image"]);
    expect(billingModesForImageSelection("gpt-image-2", "crazyrouter")).toEqual(["metered", "per_image"]);
    expect(billingModesForImageSelection("gpt-image-2.5-sunburst", "crazyrouter")).toEqual(["per_image"]);
    expect(billingModesForImageSelection("gpt-image-2", "easy88ai")).toEqual(["per_image"]);
    expect(billingModesForImageSelection("gpt-image-2.5-sunburst", "easy88ai")).toEqual(["per_image"]);

    expect(upstreamImageModel("gpt-image-2", "quickrouter", "metered")).toBe("gpt-image-2");
    expect(upstreamImageModel("gpt-image-2", "quickrouter", "per_image")).toBe("gpt-image-2-c");
    expect(upstreamImageModel("gpt-image-2.5-sunburst", "quickrouter", "metered")).toBe("gpt-image-2.5-sunburst");
    expect(upstreamImageModel("gpt-image-2.5-sunburst", "quickrouter", "per_image")).toBe("gpt-image-2.5-sunburst-c");
    expect(upstreamImageModel("gpt-image-2", "crazyrouter", "metered")).toBe("gpt-image-2-t");
    expect(upstreamImageModel("gpt-image-2", "crazyrouter", "per_image")).toBe("gpt-image-2");
    expect(upstreamImageModel("gpt-image-2.5-sunburst", "easy88ai", "per_image")).toBe("gpt-image-2.5-sunburst");
    expect(isImageSelectionSupported("gpt-image-2.5-sunburst", "crazyrouter", "metered")).toBe(false);
  });

  test("centralizes model-dependent reasoning and image quality capabilities", () => {
    expect(reasoningEffortsForModel("gpt-5.6-sol")).toEqual(["low", "medium", "high"]);
    expect(reasoningEffortsForModel("deepseek-v4-pro")).toEqual(["low", "medium", "high"]);
    expect(imageQualityForSelection("gpt-image-2", "quickrouter", "metered", "medium")).toBe("medium");
    expect(imageQualityForSelection("gpt-image-2", "quickrouter", "per_image", "low")).toBe("high");
    expect(imageQualityForSelection("gpt-image-2", "easy88ai", "per_image", "low")).toBe("low");
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
