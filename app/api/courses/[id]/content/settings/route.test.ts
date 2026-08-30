import { describe, expect, test } from "vitest";

import { PUT } from "./route";

describe("legacy course content settings route", () => {
  test("redirects model selection to account settings without returning course data", async () => {
    const response = await PUT(
      new Request("http://localhost/api/courses/course-1/content/settings", {
        method: "PUT",
        body: JSON.stringify({ writingProvider: "quickrouter_deepseek" }),
      }),
      { params: Promise.resolve({ id: "course-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "文本模型请在账户高级设置中修改" });
  });
});
