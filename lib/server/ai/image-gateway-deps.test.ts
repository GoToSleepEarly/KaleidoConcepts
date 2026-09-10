import { describe, expect, test } from "vitest";

import { createCourseImageGenerationDeps } from "./course-image-deps";
import { createPersonVisualGenerationDeps } from "./person-visual-deps";

const settings = {
  writingProvider: "gpt-5.6-sol",
  aiGateway: "easy88ai",
  quickRouterEndpoint: "main",
  imageModel: "gpt-image-2",
  imageGateway: "easy88ai",
  imageQuickRouterEndpoint: "main",
} as const;

describe("image gateway dependency snapshots", () => {
  test("records Easy88AI as the actual provider for course and person images", () => {
    expect(createCourseImageGenerationDeps(settings).provider).toBe("easy88ai_gpt_image_2");
    expect(createPersonVisualGenerationDeps(settings).provider).toBe("easy88ai_gpt_image_2");
  });
});
