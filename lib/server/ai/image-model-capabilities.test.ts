import { describe, expect, test } from "vitest";

import { imageQualityForModel, usesFixedPriceMaxQuality } from "./image-model-capabilities";

describe("图片模型能力", () => {
  test("gpt-image-2-c 无论请求档位都使用最高质量", () => {
    expect(imageQualityForModel("gpt-image-2-c", "low")).toBe("high");
    expect(imageQualityForModel("openai/gpt-image-2-c", "medium")).toBe("high");
    expect(usesFixedPriceMaxQuality("GPT-IMAGE-2-C")).toBe(true);
  });

  test("其他模型保留老师选择的质量", () => {
    expect(imageQualityForModel("gpt-image-2", "medium")).toBe("medium");
    expect(usesFixedPriceMaxQuality("gpt-image-2")).toBe(false);
  });
});
