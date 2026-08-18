import { describe, expect, test } from "vitest";

import { CourseVisualPlanResponseError } from "@/lib/server/ai/course-visual-plan-deps";
import { visualResourcesError } from "./visual-resources";

describe("visualResourcesError", () => {
  test("AI 视觉方案结构错误是明确可重试的上游响应错误，不冒充网络中断", async () => {
    const response = visualResourcesError(new CourseVisualPlanResponseError());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "AI 返回的视觉方案内容不完整，请重试",
      code: "invalid_ai_response",
      retrySafe: true,
    });
  });
});
