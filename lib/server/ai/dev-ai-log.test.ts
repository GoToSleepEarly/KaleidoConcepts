import { afterEach, describe, expect, test, vi } from "vitest";

import { devAiLog } from "./dev-ai-log";

describe("devAiLog", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  test("does not write AI logs in production", () => {
    process.env.NODE_ENV = "production";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    devAiLog({ operation: "story_outline", phase: "request", payload: { prompt: "hello" } });

    expect(info).not.toHaveBeenCalled();
  });

  test("logs development calls while redacting image data", () => {
    process.env.NODE_ENV = "development";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    devAiLog({
      operation: "person_visual_edit",
      phase: "request",
      payload: { prompt: "修改外套", image: "data:image/png;base64,abcdef" },
    });

    expect(info).toHaveBeenCalledWith(
      "[AI][person_visual_edit][request]",
      expect.objectContaining({ payload: expect.objectContaining({ image: expect.stringContaining("已省略") }) }),
    );
  });
});
